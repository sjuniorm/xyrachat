import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { fetchAudience } from "@/lib/broadcasts/audience";
import type { AudienceFilter, VariableMapping } from "@/lib/broadcasts/types";
import { applyVariables, type TemplateComponent } from "@/lib/templates/types";
import { emit } from "@/lib/api/emit";

export const runtime = "nodejs";
export const maxDuration = 300;

// Twin of /api/broadcasts/send but authenticated with CRON_SECRET instead
// of a user session, so the cron runner can launch scheduled broadcasts
// without impersonating a user. Logic is intentionally duplicated rather
// than refactored — keeps the two security surfaces (user-auth vs cron-
// auth) reviewable independently.

const META_GRAPH_VERSION = "v22.0";
const SEND_GAP_MS = 15;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { broadcastId?: string } | null;
  if (!body?.broadcastId) {
    return NextResponse.json({ ok: false, error: "broadcastId required" }, { status: 400 });
  }
  const admin = createAdminClient();

  const { data: bc } = await admin
    .from("broadcasts")
    .select("id, org_id, channel_id, template_id, status, variable_mapping, audience_filter, created_by")
    .eq("id", body.broadcastId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bc) {
    return NextResponse.json({ ok: false, error: "Broadcast not found" }, { status: 404 });
  }
  // SINGLE-WINNER CLAIM. This route owns the status transition — callers
  // (cron, v1 launch) must NOT pre-flip. The atomic conditional UPDATE only
  // succeeds for the first invocation that moves the row out of a launchable
  // state; concurrent/duplicate invocations match 0 rows and bail. This is
  // what stops the cron + an API launch (or two API launches) double-sending
  // to Meta. Re-launch of a 'failed' row is allowed.
  const { data: claimed } = await admin
    .from("broadcasts")
    .update({ status: "sending", started_at: new Date().toISOString() })
    .eq("id", bc.id)
    .in("status", ["scheduled", "draft", "failed"])
    .select("id");
  if (!claimed || claimed.length === 0) {
    return NextResponse.json(
      { ok: false, error: `Broadcast is ${bc.status} — already claimed or not launchable` },
      { status: 409 },
    );
  }

  const [{ data: tpl }, { data: channel }] = await Promise.all([
    admin
      .from("wa_templates")
      .select("id, org_id, name, language, components, meta_status, channel_id")
      .eq("id", bc.template_id)
      .maybeSingle(),
    admin
      .from("channels")
      .select("id, org_id, type, phone_number_id, access_token_vault_id")
      .eq("id", bc.channel_id)
      .maybeSingle(),
  ]);
  if (!tpl || tpl.meta_status !== "APPROVED") {
    return await fail(admin, bc.id, `Template no longer approved (${tpl?.meta_status ?? "missing"})`);
  }
  if (!channel || channel.type !== "whatsapp" || !channel.phone_number_id || !channel.access_token_vault_id) {
    return await fail(admin, bc.id, "Channel not ready");
  }
  // Defensive tenant guard — refuse to fire a broadcast against a
  // template or channel that doesn't belong to the same org as the
  // broadcast row itself. Stops cross-org drift cold even if a buggy
  // create path or manual SQL ever produced a mismatch.
  if (tpl.org_id !== bc.org_id) {
    return await fail(admin, bc.id, "Template org mismatch — refusing to send");
  }
  if (channel.org_id !== bc.org_id) {
    return await fail(admin, bc.id, "Channel org mismatch — refusing to send");
  }
  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) return await fail(admin, bc.id, "Channel token missing from vault");

  const audience = await fetchAudience(
    bc.org_id,
    (bc.audience_filter ?? { all: true }) as AudienceFilter,
  );
  let eligible = audience.filter((c) => c.phone && !c.opted_out);

  // Idempotent re-dispatch: skip recipients we already sent to in a prior
  // (possibly interrupted) run. The send-then-upsert order can't prevent a
  // duplicate Meta POST on its own, so we dedupe up front. This is what makes
  // the stuck-'sending' sweeper safe to re-launch a partially-sent broadcast.
  const { data: alreadySent } = await admin
    .from("broadcast_recipients")
    .select("contact_id")
    .eq("broadcast_id", bc.id)
    .eq("status", "sent");
  if (alreadySent && alreadySent.length > 0) {
    const sentIds = new Set(alreadySent.map((r) => r.contact_id));
    eligible = eligible.filter((c) => !sentIds.has(c.id));
  }

  await admin
    .from("broadcasts")
    .update({
      total_count: eligible.length + (alreadySent?.length ?? 0),
      skipped_opt_out_count: audience.filter((c) => c.opted_out).length,
    })
    .eq("id", bc.id);

  let sent = 0;
  let failed = 0;
  let lastErr: string | null = null;
  let cancelled = false;
  const mapping = (bc.variable_mapping ?? {}) as VariableMapping;
  const tplComponents = tpl.components as TemplateComponent[];

  for (let i = 0; i < eligible.length; i++) {
    const contact = eligible[i];
    const components = resolveComponents(tplComponents, mapping, contact.name);
    try {
      const res = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.phone_number_id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: contact.phone,
            type: "template",
            template: {
              name: tpl.name,
              language: { code: tpl.language },
              components,
            },
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { messages?: Array<{ id: string }>; error?: { message: string } }
        | null;
      const wamId = json?.messages?.[0]?.id ?? null;
      if (!res.ok || json?.error) {
        failed += 1;
        lastErr = json?.error?.message ?? `HTTP ${res.status}`;
        await admin
          .from("broadcast_recipients")
          .upsert(
            {
              broadcast_id: bc.id,
              contact_id: contact.id,
              status: "failed",
              error_message: lastErr,
              sent_at: new Date().toISOString(),
            },
            { onConflict: "broadcast_id,contact_id" },
          );
      } else {
        sent += 1;
        await admin.from("broadcast_recipients").upsert(
          {
            broadcast_id: bc.id,
            contact_id: contact.id,
            status: "sent",
            wa_message_id: wamId,
            sent_at: new Date().toISOString(),
          },
          { onConflict: "broadcast_id,contact_id" },
        );
        const conv = await ensureConversation(admin, bc.org_id, channel.id, contact.id);
        if (conv) {
          await admin.from("messages").insert({
            conversation_id: conv,
            direction: "outbound",
            content: previewForInbox(tplComponents, components),
            sender_type: bc.created_by ? "agent" : "bot",
            sender_id: bc.created_by ?? null,
            status: "sent",
            wa_message_id: wamId,
            metadata: {
              wa_template: { name: tpl.name, language: tpl.language },
              broadcast_id: bc.id,
            },
          });
        }
      }
    } catch (err) {
      failed += 1;
      lastErr = err instanceof Error ? err.message : "Network error";
    }
    // Progress persist + cancel poll: the guarded UPDATE matches 0 rows once
    // status flips to 'cancelled', which breaks the loop with partials intact.
    if (i % 50 === 49) {
      const { data: prog } = await admin
        .from("broadcasts")
        .update({ sent_count: sent, failed_count: failed, last_error: lastErr })
        .eq("id", bc.id)
        .eq("status", "sending")
        .select("id");
      if (!prog || prog.length === 0) {
        cancelled = true;
        break;
      }
    }
    if (i < eligible.length - 1) await sleep(SEND_GAP_MS);
  }

  const totalSent = sent + (alreadySent?.length ?? 0);
  await admin
    .from("broadcasts")
    .update({
      status: cancelled ? "cancelled" : "done",
      sent_count: totalSent,
      failed_count: failed,
      last_error: lastErr,
      finished_at: new Date().toISOString(),
    })
    .eq("id", bc.id);

  if (!cancelled) {
    void emit({
      type: "broadcast.completed",
      orgId: bc.org_id,
      data: {
        id: bc.id,
        sent_count: totalSent,
        failed_count: failed,
        total_count: eligible.length + (alreadySent?.length ?? 0),
      },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, sent, failed, cancelled, total: eligible.length });
}

async function fail(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  error: string,
) {
  await admin
    .from("broadcasts")
    .update({
      status: "failed",
      last_error: error,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

async function ensureConversation(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  channelId: string,
  contactId: string,
): Promise<string | null> {
  const existing = await admin
    .from("conversations")
    .select("id")
    .eq("channel_id", channelId)
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.data) return existing.data.id;
  const { data } = await admin
    .from("conversations")
    .insert({ org_id: orgId, channel_id: channelId, contact_id: contactId })
    .select("id")
    .single();
  return data?.id ?? null;
}

function resolveComponents(
  tplComponents: TemplateComponent[],
  mapping: VariableMapping,
  contactName: string | null,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const header = tplComponents.find((c) => c.type === "HEADER");
  if (header && "format" in header && header.format === "TEXT") {
    const values = (mapping.header ?? []).map((m) =>
      m.source === "contact_name" ? contactName ?? "" : m.value,
    );
    if (values.length > 0) {
      out.push({
        type: "header",
        parameters: values.map((v) => ({ type: "text", text: v })),
      });
    }
  } else if (
    header &&
    "format" in header &&
    (header.format === "IMAGE" || header.format === "VIDEO" || header.format === "DOCUMENT") &&
    mapping.header_media?.link
  ) {
    const kind = mapping.header_media.kind;
    out.push({
      type: "header",
      parameters: [{ type: kind, [kind]: { link: mapping.header_media.link } }],
    });
  }
  const bodyMap = mapping.body ?? [];
  if (bodyMap.length > 0) {
    out.push({
      type: "body",
      parameters: bodyMap.map((m) => ({
        type: "text",
        text: m.source === "contact_name" ? contactName ?? "" : m.value,
      })),
    });
  }
  return out;
}

function previewForInbox(
  tplComponents: TemplateComponent[],
  resolved: Array<Record<string, unknown>>,
): string {
  const body = tplComponents.find((c) => c.type === "BODY") as
    | { text: string }
    | undefined;
  if (!body) return "";
  const bodyResolved = resolved.find((r) => r.type === "body") as
    | { parameters?: Array<{ text: string }> }
    | undefined;
  const values = (bodyResolved?.parameters ?? []).map((p) => p.text);
  return applyVariables(body.text, values);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
