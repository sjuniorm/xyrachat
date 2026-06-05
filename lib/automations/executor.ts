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
// Wait actions are clamped so a typo can't schedule something absurdly far out.
const MAX_WAIT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type ExecContact = {
  id: string;
  org_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  instagram_id: string | null;
  telegram_id: string | null;
};
type ExecChannel = {
  id: string;
  type: string;
  org_id: string;
  phone_number_id?: string | null;
  page_id?: string | null;
  ig_business_account_id?: string | null;
  access_token_vault_id?: string | null;
  metadata?: Record<string, unknown> | null;
};
type ActionCtx = {
  automation: AutomationRow;
  contact: ExecContact;
  channel: ExecChannel;
  triggerData?: Record<string, unknown>;
  conversationId: string | null;
  // Set only when RESUMING a scheduled (post-wait) row. Used to make sends
  // idempotent across reclaim/retry: each send is stamped sched_step =
  // `${scheduledActionId}:${stepIndex}` and skipped if one already exists.
  scheduledActionId?: string;
};

// Per-contact-per-automation cap on outstanding (pending/processing) scheduled
// chains, so a chatty contact re-firing a keyword automation with a wait can't
// accumulate unbounded delayed sends.
const MAX_INFLIGHT_PER_CONTACT = 3;

function computeStatus(
  steps: ExecResult["steps"],
  firstFailure: string | null,
): ExecResult["status"] {
  if (!firstFailure) return "success";
  // All steps failed → failed; otherwise a partial success (log shows detail).
  return steps.every((s) => !s.ok) ? "failed" : "success";
}

// Runs a list of actions in order against a contact/channel context. On a
// `wait` action it persists the REMAINING actions to
// automation_scheduled_actions (with run_at) and STOPS — the per-minute runner
// resumes them later (which may itself hit the next wait). Returns where it
// stopped so the caller can log + count.
async function runActionList(
  admin: ReturnType<typeof createAdminClient>,
  actions: Action[],
  ctx: ActionCtx,
): Promise<{
  steps: ExecResult["steps"];
  firstFailure: string | null;
  conversationId: string | null;
  scheduled: boolean;
}> {
  const { automation, contact, channel } = ctx;
  const steps: ExecResult["steps"] = [];
  let conversationId = ctx.conversationId;
  let firstFailure: string | null = null;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    try {
      switch (action.type) {
        case "send_dm": {
          // Lazily create / find a conversation so the bot DM appears in
          // the inbox like any agent message would.
          if (!conversationId) {
            conversationId = await ensureConversation(admin, channel.org_id, channel.id, contact.id);
          }
          if (!conversationId) {
            steps.push({ type: action.type, ok: false, error: "No conversation" });
            firstFailure ??= "No conversation";
            break;
          }
          // Idempotency for resumed/retried rows: skip if this exact step
          // already produced an outbound (a prior attempt or a reclaim re-run).
          const stamp = ctx.scheduledActionId ? `${ctx.scheduledActionId}:${i}` : null;
          if (stamp) {
            const { data: already } = await admin
              .from("messages")
              .select("id")
              .eq("conversation_id", conversationId)
              .eq("metadata->>sched_step", stamp)
              .limit(1)
              .maybeSingle();
            if (already) {
              steps.push({ type: action.type, ok: true });
              break;
            }
          }
          const rendered = renderTemplate(action.text, contact, ctx.triggerData as Record<string, string | null | undefined>);
          const send = await sendChannelMessage({
            channel,
            recipient: pickRecipient(channel.type, contact),
            content: rendered,
            conversationId,
            extraMetadata: stamp ? { sched_step: stamp } : undefined,
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
        case "assign_smart": {
          if (!conversationId) {
            conversationId = await ensureConversation(admin, channel.org_id, channel.id, contact.id);
          }
          if (!conversationId) {
            steps.push({ type: action.type, ok: false, error: "No conversation" });
            firstFailure ??= "No conversation";
            break;
          }
          const picked = await pickSmartAgent({
            admin,
            orgId: automation.org_id,
            strategy: action.strategy,
            onlyOnline: action.only_online ?? false,
            lastAssignedAgentId: automation.last_assigned_agent_id ?? null,
          });
          if (!picked) {
            steps.push({ type: action.type, ok: false, error: "No eligible agents" });
            firstFailure ??= "No eligible agents";
            break;
          }
          await admin
            .from("conversations")
            .update({ assigned_to: picked })
            .eq("id", conversationId);
          if (action.strategy === "round_robin") {
            await admin
              .from("automations")
              .update({ last_assigned_agent_id: picked })
              .eq("id", automation.id);
          }
          steps.push({ type: action.type, ok: true });
          break;
        }
        case "webhook": {
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
              trigger: { type: automation.trigger_type, data: ctx.triggerData ?? {} },
              fired_at: new Date().toISOString(),
            }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            steps.push({ type: action.type, ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` });
            firstFailure ??= `Webhook ${res.status}`;
          } else {
            steps.push({ type: action.type, ok: true });
          }
          break;
        }
        case "add_to_sequence":
          steps.push({ type: action.type, ok: false, error: "sequences not built yet" });
          break;
        case "wait": {
          const ms = typeof action.ms === "number" && action.ms > 0 ? action.ms : 0;
          const remaining = actions.slice(i + 1);
          // A zero/negative wait, or a wait with nothing after it, is a no-op —
          // keep running (don't schedule an empty resume).
          if (ms <= 0 || remaining.length === 0) {
            steps.push({ type: action.type, ok: true });
            break;
          }
          // Cap outstanding chains per (automation, contact) so a re-firing
          // keyword automation can't accumulate unbounded delayed sends.
          const { count: inflight } = await admin
            .from("automation_scheduled_actions")
            .select("id", { count: "exact", head: true })
            .eq("automation_id", automation.id)
            .eq("contact_id", contact.id)
            .in("status", ["pending", "processing"]);
          if ((inflight ?? 0) >= MAX_INFLIGHT_PER_CONTACT) {
            steps.push({ type: action.type, ok: false, error: "too many in-flight waits for this contact; skipped" });
            firstFailure ??= "in-flight wait cap reached";
            // Stop — do NOT fire the tail inline (that would defeat the delay).
            return { steps, firstFailure, conversationId, scheduled: false };
          }
          const runAt = new Date(Date.now() + Math.min(ms, MAX_WAIT_MS)).toISOString();
          const { error } = await admin.from("automation_scheduled_actions").insert({
            automation_id: automation.id,
            org_id: automation.org_id,
            contact_id: contact.id,
            channel_id: channel.id,
            conversation_id: conversationId,
            remaining_actions: remaining,
            trigger_data: ctx.triggerData ?? {},
            run_at: runAt,
            status: "pending",
          });
          if (error) {
            // Scheduling failed — STOP rather than firing the post-wait tail
            // immediately (which would silently ignore the delay).
            steps.push({ type: action.type, ok: false, error: error.message });
            firstFailure ??= error.message;
            return { steps, firstFailure, conversationId, scheduled: false };
          }
          steps.push({ type: action.type, ok: true });
          // Stop here; the remaining actions run when the schedule fires.
          return { steps, firstFailure, conversationId, scheduled: true };
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      steps.push({ type: action.type, ok: false, error: msg });
      firstFailure ??= msg;
    }
  }

  return { steps, firstFailure, conversationId, scheduled: false };
}

// Run an automation against a contact + optional conversation context.
//
// Conversation is optional because some triggers (new follower, comment)
// might fire before a conversation row exists. The executor lazily
// creates one when a send_dm step needs to land an outbound message in
// the inbox.
export async function executeAutomation(input: {
  automation: AutomationRow;
  contact: ExecContact;
  channel: ExecChannel;
  conversationId?: string | null;
  triggerData?: Record<string, unknown>;
}): Promise<ExecResult> {
  const admin = createAdminClient();
  const { automation, contact, channel } = input;

  // Tenant isolation: refuse cross-org execution outright.
  if (automation.org_id !== contact.org_id || automation.org_id !== channel.org_id) {
    return { status: "failed", steps: [], error_message: "Cross-org execution refused" };
  }

  const r = await runActionList(admin, automation.actions ?? [], {
    automation,
    contact,
    channel,
    triggerData: input.triggerData,
    conversationId: input.conversationId ?? null,
  });
  const status = computeStatus(r.steps, r.firstFailure);

  // Log + counters for the INITIAL fire (run_count = number of triggers; a
  // later resume doesn't bump it).
  await admin.from("automation_logs").insert({
    automation_id: automation.id,
    contact_id: contact.id,
    conversation_id: r.conversationId,
    trigger_data: input.triggerData ?? {},
    steps: r.steps,
    status,
    error_message: r.firstFailure,
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

  return { status, steps: r.steps, error_message: r.firstFailure };
}

// Resume a scheduled (post-wait) action list. Called by the per-minute runner
// at /api/internal/automation-runner. Re-fetches everything fresh (so a paused
// flow respects edits + a deleted/deactivated automation) and re-runs the
// remaining actions — which may schedule the NEXT wait.
export async function resumeAutomation(row: {
  scheduled_action_id: string;
  automation_id: string;
  org_id: string;
  contact_id: string;
  channel_id: string;
  conversation_id: string | null;
  remaining_actions: Action[];
  trigger_data: Record<string, unknown> | null;
}): Promise<ExecResult> {
  const admin = createAdminClient();

  const { data: automation } = await admin
    .from("automations")
    .select("*")
    .eq("id", row.automation_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!automation || !automation.active) {
    return { status: "skipped", steps: [], error_message: "automation inactive or deleted" };
  }
  const [{ data: contact }, { data: channel }] = await Promise.all([
    admin
      .from("contacts")
      .select("id, org_id, name, phone, email, instagram_id, telegram_id")
      .eq("id", row.contact_id)
      .maybeSingle(),
    admin
      .from("channels")
      .select("id, type, org_id, phone_number_id, page_id, ig_business_account_id, access_token_vault_id, metadata")
      .eq("id", row.channel_id)
      .maybeSingle(),
  ]);
  if (!contact || !channel) {
    return { status: "failed", steps: [], error_message: "contact or channel missing" };
  }
  // Tenant isolation: every party must share the scheduled row's org.
  if (
    automation.org_id !== row.org_id ||
    contact.org_id !== row.org_id ||
    channel.org_id !== row.org_id
  ) {
    return { status: "failed", steps: [], error_message: "Cross-org execution refused" };
  }

  const r = await runActionList(admin, row.remaining_actions ?? [], {
    automation: automation as AutomationRow,
    contact: contact as ExecContact,
    channel: channel as ExecChannel,
    triggerData: row.trigger_data ?? {},
    conversationId: row.conversation_id ?? null,
    scheduledActionId: row.scheduled_action_id,
  });
  const status = computeStatus(r.steps, r.firstFailure);

  // Continuation log row (so the detail page shows the resumed steps). We do
  // NOT bump run_count (same trigger), but DO record a failure so the
  // success/failure ratio still reflects resume failures.
  await admin.from("automation_logs").insert({
    automation_id: automation.id,
    contact_id: contact.id,
    conversation_id: r.conversationId,
    trigger_data: row.trigger_data ?? {},
    steps: r.steps,
    status,
    error_message: r.firstFailure,
  });
  if (status === "failed") {
    await admin
      .from("automations")
      .update({ failure_count: (automation.failure_count ?? 0) + 1 })
      .eq("id", automation.id);
  }

  return { status, steps: r.steps, error_message: r.firstFailure };
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
  extraMetadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const { channel, recipient, content, conversationId } = input;
  const msgMetadata = { automation: true, ...(input.extraMetadata ?? {}) };
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
      metadata: msgMetadata,
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
      metadata: msgMetadata,
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
      metadata: msgMetadata,
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

// Smart-assignment helper. Strategies:
// - least_busy: agent with fewest currently-open conversations (ties
//   broken by name for determinism).
// - round_robin: next agent (alphabetically by id) AFTER the last one
//   this automation assigned to, wrapping around. Cold-start picks the
//   first agent.
// `only_online` filters to availability='online' first; falls back to
// the same strategy across all agents if nobody is online (better to
// land on someone vs leave the contact dangling).
async function pickSmartAgent(params: {
  admin: ReturnType<typeof createAdminClient>;
  orgId: string;
  strategy: "round_robin" | "least_busy";
  onlyOnline: boolean;
  lastAssignedAgentId: string | null;
}): Promise<string | null> {
  const { admin, orgId, strategy, onlyOnline, lastAssignedAgentId } = params;
  // Pull all active agents in the org (any role can be assigned).
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, availability")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("id", { ascending: true });
  let pool = (profiles ?? []) as Array<{
    id: string;
    full_name: string | null;
    availability: string | null;
  }>;
  if (pool.length === 0) return null;

  if (onlyOnline) {
    const online = pool.filter((p) => p.availability === "online");
    // Fall back to the full pool when nobody is online so the contact
    // still lands on a human rather than disappearing into a queue.
    if (online.length > 0) pool = online;
  }

  if (strategy === "round_robin") {
    if (!lastAssignedAgentId) return pool[0].id;
    const idx = pool.findIndex((p) => p.id === lastAssignedAgentId);
    if (idx < 0) return pool[0].id; // last agent left the org
    return pool[(idx + 1) % pool.length].id;
  }

  // least_busy: count open conversations per agent in this org.
  const { data: convs } = await admin
    .from("conversations")
    .select("assigned_to")
    .eq("org_id", orgId)
    .eq("status", "open")
    .is("deleted_at", null)
    .not("assigned_to", "is", null);
  const load = new Map<string, number>();
  for (const c of convs ?? []) {
    const a = c.assigned_to as string | null;
    if (a) load.set(a, (load.get(a) ?? 0) + 1);
  }
  // Pick the agent in pool with min load; ties resolved by sort order
  // (id ascending), which matches the round-robin order so behaviour
  // is consistent across strategies.
  let best = pool[0];
  let bestLoad = load.get(best.id) ?? 0;
  for (const p of pool.slice(1)) {
    const l = load.get(p.id) ?? 0;
    if (l < bestLoad) {
      best = p;
      bestLoad = l;
    }
  }
  return best.id;
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
