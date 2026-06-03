import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { fetchAudience } from "@/lib/broadcasts/audience";
import { rateLimit } from "@/lib/rate-limit";
import type { AudienceFilter, VariableMapping } from "@/lib/broadcasts/types";
import { applyVariables, type TemplateComponent } from "@/lib/templates/types";

export const runtime = "nodejs";
// Vercel default is 300s on Hobby+. Big broadcasts (>~15k recipients at
// 67/sec) need a VPS worker hitting this same endpoint in slices via the
// CRON path below.
export const maxDuration = 300;

const META_GRAPH_VERSION = "v22.0";
// Meta allows ~80 messages/sec on a healthy WA business account. We target
// 67/sec (15ms gap) to leave headroom for occasional retries.
const SEND_GAP_MS = 15;
// Max recipients we process inside one HTTP invocation. Above this, the UI
// nudges the user to split — VPS worker support lands later.
const MAX_RECIPIENTS_PER_RUN = 15_000;

type SendBody = { broadcastId: string };

export async function POST(req: NextRequest) {
  // 1. Auth — must be a signed-in agent of the broadcast's org.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) {
    return NextResponse.json({ ok: false, error: "No org" }, { status: 403 });
  }
  if (!["owner", "admin", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.broadcastId) {
    return NextResponse.json({ ok: false, error: "broadcastId required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 2. Load broadcast + template + channel.
  const { data: bc } = await admin
    .from("broadcasts")
    .select("id, org_id, channel_id, template_id, status, variable_mapping, audience_filter, name, total_count")
    .eq("id", body.broadcastId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bc) {
    return NextResponse.json({ ok: false, error: "Broadcast not found" }, { status: 404 });
  }
  if (bc.org_id !== profile.org_id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // Per-org safety throttle on launching broadcasts (cost/abuse). Fails open
  // when Upstash isn't configured.
  const rl = await rateLimit("broadcast:send", profile.org_id, {
    limit: 10,
    windowSec: 600,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many broadcasts launched. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  // Atomically CLAIM the broadcast: flip draft/scheduled/failed → sending in a
  // single conditional UPDATE. Two concurrent requests can't both win — the
  // loser matches 0 rows and 409s. Closes the TOCTOU double-send race (a
  // non-atomic check-then-update previously let concurrent requests both send).
  const { data: claimed } = await admin
    .from("broadcasts")
    .update({
      status: "sending",
      started_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", bc.id)
    .in("status", ["draft", "scheduled", "failed"])
    .select("id");
  if (!claimed || claimed.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Broadcast is already sending or finished" },
      { status: 409 },
    );
  }

  const [{ data: tpl }, { data: channel }] = await Promise.all([
    admin
      .from("wa_templates")
      .select("id, org_id, name, language, channel_id, components, meta_status")
      .eq("id", bc.template_id)
      .maybeSingle(),
    admin
      .from("channels")
      .select("id, org_id, type, phone_number_id, access_token_vault_id")
      .eq("id", bc.channel_id)
      .maybeSingle(),
  ]);
  if (!tpl) {
    return failBroadcast(admin, bc.id, "Template not found");
  }
  // Defensive tenant guard: even though createBroadcast() verifies org
  // alignment at creation time, an old draft + a since-modified template/
  // channel could drift. Refuse to send when org_ids don't line up.
  if (tpl.org_id !== bc.org_id) {
    return failBroadcast(admin, bc.id, "Template org mismatch — refusing to send");
  }
  if (channel && channel.org_id !== bc.org_id) {
    return failBroadcast(admin, bc.id, "Channel org mismatch — refusing to send");
  }
  if (tpl.meta_status !== "APPROVED") {
    return failBroadcast(admin, bc.id, `Template no longer approved (${tpl.meta_status})`);
  }
  if (!channel || channel.type !== "whatsapp") {
    return failBroadcast(admin, bc.id, "Channel is not WhatsApp");
  }
  if (!channel.phone_number_id || !channel.access_token_vault_id) {
    return failBroadcast(admin, bc.id, "Channel is missing phone_number_id or token");
  }

  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) {
    return failBroadcast(admin, bc.id, "Channel token missing from vault");
  }

  // 3. Resolve audience NOW (re-evaluated at send time — opt-outs since
  //    draft, new contacts, etc.).
  const audience = await fetchAudience(
    bc.org_id,
    (bc.audience_filter ?? { all: true }) as AudienceFilter,
  );
  const eligible = audience.filter((c) => c.phone && !c.opted_out);
  const skipped_opt_out = audience.filter((c) => c.opted_out).length;

  if (eligible.length > MAX_RECIPIENTS_PER_RUN) {
    return failBroadcast(
      admin,
      bc.id,
      `Audience too large for a single run (${eligible.length} > ${MAX_RECIPIENTS_PER_RUN}). Split into smaller broadcasts or run from a VPS worker.`,
    );
  }

  // 4. Mark sending. Counts get filled in as we go.
  await admin
    .from("broadcasts")
    .update({
      status: "sending",
      started_at: new Date().toISOString(),
      total_count: eligible.length,
      skipped_opt_out_count: skipped_opt_out,
      sent_count: 0,
      failed_count: 0,
      last_error: null,
    })
    .eq("id", bc.id);

  // 5. Pre-create recipient rows (queued). On accidental rerun the unique
  //    index protects against double-send.
  const recipientRows = eligible.map((c) => ({
    broadcast_id: bc.id,
    contact_id: c.id,
    status: "queued" as const,
  }));
  if (recipientRows.length > 0) {
    await admin
      .from("broadcast_recipients")
      .upsert(recipientRows, {
        onConflict: "broadcast_id,contact_id",
        ignoreDuplicates: true,
      });
  }

  // 6. Send loop. Rate-limited with a 15ms gap. We don't parallelize because
  //    Meta's per-WABA limit is the gate, not network round-trip.
  let sent = 0;
  let failed = 0;
  let lastErr: string | null = null;
  const conversationsBumped = new Set<string>();
  // For each send, we also create or upsert a conversation + outbound message
  // so the broadcast appears in the inbox just like any other agent send.
  for (let i = 0; i < eligible.length; i++) {
    const contact = eligible[i];
    const components = buildTemplateComponents(
      tpl.components as TemplateComponent[],
      bc.variable_mapping as VariableMapping,
      contact.name,
    );

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
          .update({
            status: "failed",
            error_message: lastErr,
            sent_at: new Date().toISOString(),
          })
          .eq("broadcast_id", bc.id)
          .eq("contact_id", contact.id);
      } else {
        sent += 1;
        await admin
          .from("broadcast_recipients")
          .update({
            status: "sent",
            wa_message_id: wamId,
            sent_at: new Date().toISOString(),
          })
          .eq("broadcast_id", bc.id)
          .eq("contact_id", contact.id);

        // Mirror into the inbox: ensure a conversation row + outbound
        // message exist so the broadcast shows up like any agent reply.
        const conv = await ensureConversation(admin, bc.org_id, channel.id, contact.id);
        if (conv) {
          await admin.from("messages").insert({
            conversation_id: conv,
            direction: "outbound",
            content: previewForInbox(tpl.components as TemplateComponent[], components),
            sender_type: "agent",
            sender_id: user.id,
            status: "sent",
            wa_message_id: wamId,
            metadata: {
              wa_template: { name: tpl.name, language: tpl.language },
              broadcast_id: bc.id,
            },
          });
          conversationsBumped.add(conv);
        }
      }
    } catch (err) {
      failed += 1;
      lastErr = err instanceof Error ? err.message : "Network error";
      await admin
        .from("broadcast_recipients")
        .update({
          status: "failed",
          error_message: lastErr,
          sent_at: new Date().toISOString(),
        })
        .eq("broadcast_id", bc.id)
        .eq("contact_id", contact.id);
    }

    // Persist progress every 50 sends so the UI shows movement without
    // hammering the DB.
    if (i % 50 === 49) {
      await admin
        .from("broadcasts")
        .update({ sent_count: sent, failed_count: failed, last_error: lastErr })
        .eq("id", bc.id);
    }

    if (i < eligible.length - 1) await sleep(SEND_GAP_MS);
  }

  // Bump last_message_at on touched conversations in one batched query —
  // fine to be slightly stale; broadcasts touching the inbox isn't the
  // common case.
  if (conversationsBumped.size > 0) {
    const now = new Date().toISOString();
    await admin
      .from("conversations")
      .update({ last_message_at: now })
      .in("id", Array.from(conversationsBumped));
  }

  // 7. Mark done.
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

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    skipped_opt_out,
    total: eligible.length,
  });
}

async function failBroadcast(
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
    .select("id, status")
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

// Resolves the template components for one recipient — substitutes mapped
// values into header/body parameter arrays in the shape Meta expects.
function buildTemplateComponents(
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
  // Button parameters left for a follow-up — needed only for dynamic-URL
  // and copy-code button types.
  return out;
}

// Builds a readable preview of the rendered template for the inbox UI.
// We don't have per-recipient text variables on the local template row,
// so we approximate: take the body string and substitute the resolved
// parameter values.
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
