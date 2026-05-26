import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import {
  fetchAudience,
  type AudienceFilter,
  type VariableMapping,
} from "@/lib/broadcasts/actions";
import { applyVariables, type TemplateComponent } from "@/lib/templates/types";

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
  // The cron runner pessimistically flipped status to 'sending' before
  // calling us. If we got here from another path (e.g. manual VPS
  // re-trigger), accept 'sending' too — but refuse 'done' / 'cancelled'.
  if (!["sending", "scheduled", "draft"].includes(bc.status)) {
    return NextResponse.json({ ok: false, error: `Broadcast is ${bc.status}` }, { status: 409 });
  }

  const [{ data: tpl }, { data: channel }] = await Promise.all([
    admin
      .from("wa_templates")
      .select("id, name, language, components, meta_status, channel_id")
      .eq("id", bc.template_id)
      .maybeSingle(),
    admin
      .from("channels")
      .select("id, type, phone_number_id, access_token_vault_id")
      .eq("id", bc.channel_id)
      .maybeSingle(),
  ]);
  if (!tpl || tpl.meta_status !== "APPROVED") {
    return await fail(admin, bc.id, `Template no longer approved (${tpl?.meta_status ?? "missing"})`);
  }
  if (!channel || channel.type !== "whatsapp" || !channel.phone_number_id || !channel.access_token_vault_id) {
    return await fail(admin, bc.id, "Channel not ready");
  }
  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) return await fail(admin, bc.id, "Channel token missing from vault");

  const audience = await fetchAudience(
    bc.org_id,
    (bc.audience_filter ?? { all: true }) as AudienceFilter,
  );
  const eligible = audience.filter((c) => c.phone && !c.opted_out);

  await admin
    .from("broadcasts")
    .update({
      status: "sending",
      started_at: new Date().toISOString(),
      total_count: eligible.length,
      skipped_opt_out_count: audience.filter((c) => c.opted_out).length,
    })
    .eq("id", bc.id);

  let sent = 0;
  let failed = 0;
  let lastErr: string | null = null;
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
    if (i % 50 === 49) {
      await admin
        .from("broadcasts")
        .update({ sent_count: sent, failed_count: failed, last_error: lastErr })
        .eq("id", bc.id);
    }
    if (i < eligible.length - 1) await sleep(SEND_GAP_MS);
  }

  await admin
    .from("broadcasts")
    .update({
      status: "done",
      sent_count: sent,
      failed_count: failed,
      last_error: lastErr,
      finished_at: new Date().toISOString(),
    })
    .eq("id", bc.id);

  return NextResponse.json({ ok: true, sent, failed, total: eligible.length });
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
