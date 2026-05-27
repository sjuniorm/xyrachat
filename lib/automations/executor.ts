import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { renderTemplate, type Action, type AutomationRow } from "./types";

// Result the executor logs to automation_logs.
export type ExecResult = {
  status: "success" | "failed" | "skipped";
  steps: Array<{ type: Action["type"]; ok: boolean; error?: string }>;
  error_message: string | null;
};

const META_GRAPH_VERSION = "v22.0";

// Run an automation against a contact + optional conversation context.
//
// Conversation is optional because some triggers (new follower, comment)
// might fire before a conversation row exists. The executor lazily
// creates one when a send_dm step needs to land an outbound message in
// the inbox.
export async function executeAutomation(input: {
  automation: AutomationRow;
  contact: {
    id: string;
    org_id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    instagram_id: string | null;
    telegram_id: string | null;
  };
  channel: {
    id: string;
    type: string;
    org_id: string;
    phone_number_id?: string | null;
    page_id?: string | null;
    ig_business_account_id?: string | null;
    access_token_vault_id?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  conversationId?: string | null;
  triggerData?: Record<string, unknown>;
}): Promise<ExecResult> {
  const admin = createAdminClient();
  const { automation, contact, channel } = input;

  // Tenant isolation: refuse cross-org execution outright.
  if (automation.org_id !== contact.org_id || automation.org_id !== channel.org_id) {
    return {
      status: "failed",
      steps: [],
      error_message: "Cross-org execution refused",
    };
  }

  const steps: ExecResult["steps"] = [];
  let conversationId = input.conversationId ?? null;
  let firstFailure: string | null = null;

  for (const action of automation.actions ?? []) {
    try {
      switch (action.type) {
        case "send_dm": {
          // Lazily create / find a conversation so the bot DM appears in
          // the inbox like any agent message would. WhatsApp triggers
          // generally already have a conversation_id from the webhook
          // caller; IG triggers (comment / follow) may not.
          if (!conversationId) {
            conversationId = await ensureConversation(admin, channel.org_id, channel.id, contact.id);
          }
          if (!conversationId) {
            steps.push({ type: action.type, ok: false, error: "No conversation" });
            firstFailure ??= "No conversation";
            break;
          }
          const rendered = renderTemplate(action.text, contact, input.triggerData as Record<string, string | null | undefined>);
          const send = await sendChannelMessage({
            channel,
            recipient: pickRecipient(channel.type, contact),
            content: rendered,
            conversationId,
          });
          if (!send.ok) {
            steps.push({ type: action.type, ok: false, error: send.error ?? "send failed" });
            firstFailure ??= send.error ?? "send failed";
          } else {
            steps.push({ type: action.type, ok: true });
          }
          break;
        }
        case "tag_contact": {
          const tag = action.tag.trim();
          if (!tag) {
            steps.push({ type: action.type, ok: false, error: "Empty tag" });
            firstFailure ??= "Empty tag";
            break;
          }
          // Append-only if not already present. Postgres array_append
          // would duplicate; we read + dedupe + write.
          const { data: row } = await admin
            .from("contacts")
            .select("tags")
            .eq("id", contact.id)
            .maybeSingle();
          const current = (row?.tags ?? []) as string[];
          if (!current.includes(tag)) {
            await admin
              .from("contacts")
              .update({ tags: [...current, tag] })
              .eq("id", contact.id);
          }
          steps.push({ type: action.type, ok: true });
          break;
        }
        case "assign_agent": {
          if (!conversationId) {
            conversationId = await ensureConversation(admin, channel.org_id, channel.id, contact.id);
          }
          if (!conversationId) {
            steps.push({ type: action.type, ok: false, error: "No conversation" });
            firstFailure ??= "No conversation";
            break;
          }
          await admin
            .from("conversations")
            .update({ assigned_to: action.agent_id ?? null })
            .eq("id", conversationId);
          steps.push({ type: action.type, ok: true });
          break;
        }
        case "webhook": {
          // POST a JSON payload to the configured URL. Optional bearer
          // token via `secret` (caller-supplied, stored on the row).
          const res = await fetch(action.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(action.secret ? { Authorization: `Bearer ${action.secret}` } : {}),
            },
            body: JSON.stringify({
              automation_id: automation.id,
              automation_name: automation.name,
              contact: {
                id: contact.id,
                name: contact.name,
                phone: contact.phone,
                email: contact.email,
                instagram_id: contact.instagram_id,
                telegram_id: contact.telegram_id,
              },
              trigger: {
                type: automation.trigger_type,
                data: input.triggerData ?? {},
              },
              fired_at: new Date().toISOString(),
            }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            steps.push({
              type: action.type,
              ok: false,
              error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
            });
            firstFailure ??= `Webhook ${res.status}`;
          } else {
            steps.push({ type: action.type, ok: true });
          }
          break;
        }
        case "add_to_sequence":
          // Placeholder — sequence runner doesn't exist yet. Mark
          // skipped so the analytics row reflects it accurately.
          steps.push({ type: action.type, ok: false, error: "sequences not built yet" });
          break;
        case "wait":
          // Deferred. We'd need a delayed_actions table + a runner
          // (pg_cron or Vercel cron). For now we log-and-skip so the
          // user can author flows with wait nodes even though they
          // process immediately.
          steps.push({ type: action.type, ok: false, error: "wait deferred — fires immediately" });
          break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      steps.push({ type: action.type, ok: false, error: msg });
      firstFailure ??= msg;
    }
  }

  const status: ExecResult["status"] = firstFailure
    ? steps.every((s) => !s.ok)
      ? "failed"
      : "success" // partial success — log the steps array for the detail page
    : "success";

  // Maintain run + outcome counters on the automation row + write the
  // detailed log row. We use the admin client so RLS doesn't fight us
  // — RLS gates SELECT for org members; writes are server-only.
  await admin.from("automation_logs").insert({
    automation_id: automation.id,
    contact_id: contact.id,
    conversation_id: conversationId,
    trigger_data: input.triggerData ?? {},
    steps,
    status,
    error_message: firstFailure,
  });
  await admin
    .from("automations")
    .update({
      run_count: (automation.run_count ?? 0) + 1,
      success_count: (automation.success_count ?? 0) + (status === "success" ? 1 : 0),
      failure_count: (automation.failure_count ?? 0) + (status === "failed" ? 1 : 0),
      last_triggered_at: new Date().toISOString(),
    })
    .eq("id", automation.id);

  return { status, steps, error_message: firstFailure };
}

// =====================================================================
// Provider send wrappers. Mirror the live `/api/channels/<provider>/send`
// behaviour but run inline so we can attribute the outbound message to
// `sender_type = 'bot'` (so the inbox shows it as automation, not agent).
// =====================================================================
async function sendChannelMessage(input: {
  channel: {
    id: string;
    type: string;
    phone_number_id?: string | null;
    page_id?: string | null;
    ig_business_account_id?: string | null;
    access_token_vault_id?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  recipient: string;
  content: string;
  conversationId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { channel, recipient, content, conversationId } = input;
  if (!recipient) return { ok: false, error: "Contact has no handle for this channel" };
  if (!channel.access_token_vault_id) return { ok: false, error: "Channel token missing" };
  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) return { ok: false, error: "Channel token unreadable" };

  const admin = createAdminClient();
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "Empty message" };

  if (channel.type === "whatsapp") {
    if (!channel.phone_number_id) return { ok: false, error: "Channel missing phone_number_id" };
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
          to: recipient,
          type: "text",
          text: { body: trimmed },
        }),
      },
    );
    const json = (await res.json().catch(() => null)) as {
      messages?: Array<{ id: string }>;
      error?: { message: string };
    } | null;
    if (!res.ok || json?.error) {
      return { ok: false, error: json?.error?.message ?? `Meta API HTTP ${res.status}` };
    }
    await admin.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      content: trimmed,
      sender_type: "bot",
      status: "sent",
      wa_message_id: json?.messages?.[0]?.id ?? null,
      metadata: { automation: true },
    });
    await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
    return { ok: true };
  }

  if (channel.type === "instagram") {
    // IG-direct vs Page-linked: same split as the send endpoint.
    const meta = (channel.metadata ?? {}) as { ig_login_user_id?: string };
    const igUserId = channel.page_id
      ? null
      : meta.ig_login_user_id ?? channel.ig_business_account_id;
    const url = channel.page_id
      ? `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.page_id}/messages`
      : `https://graph.instagram.com/${META_GRAPH_VERSION}/${igUserId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipient },
        messaging_type: "RESPONSE",
        message: { text: trimmed },
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      message_id?: string;
      error?: { message: string };
    } | null;
    if (!res.ok || json?.error) {
      return { ok: false, error: json?.error?.message ?? `IG API HTTP ${res.status}` };
    }
    await admin.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      content: trimmed,
      sender_type: "bot",
      status: "sent",
      ig_message_id: json?.message_id ?? null,
      metadata: { automation: true },
    });
    await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
    return { ok: true };
  }

  if (channel.type === "telegram") {
    // recipient is the contact's telegram_id (chat id).
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: recipient, text: trimmed }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: { chat: { id: number }; message_id: number };
      description?: string;
    } | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.description ?? `Telegram HTTP ${res.status}` };
    }
    const tgKey = json.result ? `${json.result.chat.id}:${json.result.message_id}` : null;
    await admin.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      content: trimmed,
      sender_type: "bot",
      status: "sent",
      telegram_message_id: tgKey,
      metadata: { automation: true },
    });
    await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
    return { ok: true };
  }

  return { ok: false, error: `Send not implemented for ${channel.type}` };
}

function pickRecipient(
  channelType: string,
  contact: { phone: string | null; instagram_id: string | null; telegram_id: string | null },
): string {
  switch (channelType) {
    case "whatsapp":
      return contact.phone ?? "";
    case "instagram":
      return contact.instagram_id ?? "";
    case "telegram":
      return contact.telegram_id ?? "";
    default:
      return "";
  }
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
  if (existing.data) {
    if (existing.data.status === "closed" || existing.data.status === "snoozed") {
      await admin
        .from("conversations")
        .update({ status: "open", snooze_until: null })
        .eq("id", existing.data.id);
    }
    return existing.data.id;
  }
  const { data } = await admin
    .from("conversations")
    .insert({ org_id: orgId, channel_id: channelId, contact_id: contactId })
    .select("id")
    .single();
  return data?.id ?? null;
}
