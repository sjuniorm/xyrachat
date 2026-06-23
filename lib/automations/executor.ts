import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { emit } from "@/lib/api/emit";
import {
  renderTemplate,
  evaluateConditions,
  type Action,
  type LeafAction,
  type AutomationRow,
} from "./types";

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
  messenger_id: string | null;
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
  // Lazily initialized per run: tracks whether the one-allowed Instagram
  // private-reply-to-comment is still available (consumed by the first IG send
  // on an ig_comment_keyword trigger). Not a private field — mutated in place.
  commentReply?: { available: boolean };
};

// Per-contact-per-automation cap on outstanding (pending/processing) scheduled
// chains, so a chatty contact re-firing a keyword automation with a wait can't
// accumulate unbounded delayed sends.
const MAX_INFLIGHT_PER_CONTACT = 3;
// Default deadline for a wait_for_reply: if the contact doesn't reply within
// this window, the timer runner resumes the flow on the no-reply path.
const DEFAULT_REPLY_TIMEOUT_MS = 24 * 60 * 60 * 1000;
// Retry cap for resumed chains (mirrors the runner's MAX_ATTEMPTS).
const MAX_RESUME_ATTEMPTS = 5;

function computeStatus(
  steps: ExecResult["steps"],
  firstFailure: string | null,
): ExecResult["status"] {
  if (!firstFailure) return "success";
  // All steps failed → failed; otherwise a partial success (log shows detail).
  return steps.every((s) => !s.ok) ? "failed" : "success";
}

// Returns the IG comment_id to use as a private-reply recipient for THIS send,
// or undefined. Consumes the one-allowed private reply: only the first IG send
// of an initial (non-resumed) ig_comment_keyword run gets it. Lazily inits the
// per-run flag on ctx so it's tracked across the action loop + branches.
function consumeCommentReply(ctx: ActionCtx, channelType: string): string | undefined {
  if (ctx.commentReply === undefined) {
    ctx.commentReply = {
      available:
        !ctx.scheduledActionId &&
        channelType === "instagram" &&
        ctx.automation.trigger_type === "ig_comment_keyword" &&
        typeof ctx.triggerData?.comment_id === "string" &&
        (ctx.triggerData.comment_id as string).length > 0,
    };
  }
  if (channelType !== "instagram" || !ctx.commentReply.available) return undefined;
  ctx.commentReply.available = false;
  return ctx.triggerData?.comment_id as string;
}

// Executes a single LEAF action (the "do something" steps). Shared by the
// top-level loop AND if/else branches so the logic — including send
// idempotency — lives in one place. Returns the (possibly lazily-created)
// conversationId. Does not throw for handled errors; the caller try/catches.
async function execLeafAction(
  admin: ReturnType<typeof createAdminClient>,
  action: LeafAction,
  ctx: ActionCtx,
  conversationId: string | null,
  stampKey: string | null,
): Promise<{ ok: boolean; error?: string; conversationId: string | null }> {
  const { automation, contact, channel } = ctx;
  switch (action.type) {
    case "send_dm": {
      let convId = conversationId;
      if (!convId) convId = await ensureConversation(admin, channel.org_id, channel.id, contact.id);
      if (!convId) return { ok: false, error: "No conversation", conversationId: convId };
      // Idempotency for resumed/retried rows: skip if this exact step already
      // produced an outbound (a prior attempt or a reclaim re-run).
      if (stampKey) {
        const { data: already } = await admin
          .from("messages")
          .select("id")
          .eq("conversation_id", convId)
          .eq("metadata->>sched_step", stampKey)
          .limit(1)
          .maybeSingle();
        if (already) return { ok: true, conversationId: convId };
      }
      const rendered = renderTemplate(action.text, contact, ctx.triggerData as Record<string, string | null | undefined>);
      // IG comment trigger: the FIRST DM must be a private reply to the comment
      // (recipient: comment_id). A fresh commenter has no open 24h window, so a
      // normal RESPONSE send silently never arrives. One private reply is allowed
      // per comment — consume it for the first IG send only.
      const commentId = consumeCommentReply(ctx, channel.type);
      const send = await sendChannelMessage({
        channel,
        recipient: pickRecipient(channel.type, contact),
        content: rendered,
        conversationId: convId,
        commentId,
        // Tag the send so the inbox can annotate "Automated · <name>".
        extraMetadata: {
          ...(stampKey ? { sched_step: stampKey } : {}),
          automation_meta: { name: automation.name, trigger_type: automation.trigger_type },
        },
      });
      return send.ok
        ? { ok: true, conversationId: convId }
        : { ok: false, error: send.error ?? "send failed", conversationId: convId };
    }
    case "tag_contact": {
      const tag = action.tag.trim();
      if (!tag) return { ok: false, error: "Empty tag", conversationId };
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
      return { ok: true, conversationId };
    }
    case "assign_agent": {
      let convId = conversationId;
      if (!convId) convId = await ensureConversation(admin, channel.org_id, channel.id, contact.id);
      if (!convId) return { ok: false, error: "No conversation", conversationId: convId };
      await admin
        .from("conversations")
        .update({ assigned_to: action.agent_id ?? null })
        .eq("id", convId);
      return { ok: true, conversationId: convId };
    }
    case "assign_smart": {
      let convId = conversationId;
      if (!convId) convId = await ensureConversation(admin, channel.org_id, channel.id, contact.id);
      if (!convId) return { ok: false, error: "No conversation", conversationId: convId };
      const picked = await pickSmartAgent({
        admin,
        orgId: automation.org_id,
        strategy: action.strategy,
        onlyOnline: action.only_online ?? false,
        lastAssignedAgentId: automation.last_assigned_agent_id ?? null,
      });
      if (!picked) return { ok: false, error: "No eligible agents", conversationId: convId };
      await admin.from("conversations").update({ assigned_to: picked }).eq("id", convId);
      if (action.strategy === "round_robin") {
        await admin
          .from("automations")
          .update({ last_assigned_agent_id: picked })
          .eq("id", automation.id);
      }
      return { ok: true, conversationId: convId };
    }
    case "webhook": {
      // Idempotency on resumed/retried chains: skip if this exact step already
      // fired (tracked in trigger_data, mirroring the send_dm sched_step skip),
      // and send an Idempotency-Key so the receiver can dedupe too.
      const fired =
        (ctx.triggerData?._fired_webhooks as string[] | undefined) ?? [];
      if (stampKey && fired.includes(stampKey)) {
        return { ok: true, conversationId };
      }
      const res = await fetch(action.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(stampKey ? { "Idempotency-Key": stampKey } : {}),
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
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, conversationId };
      }
      // Record the fire so a retry of this resumed chain doesn't re-POST it.
      if (stampKey && ctx.scheduledActionId) {
        const merged = { ...(ctx.triggerData ?? {}), _fired_webhooks: [...fired, stampKey] };
        ctx.triggerData = merged;
        await admin
          .from("automation_scheduled_actions")
          .update({ trigger_data: merged })
          .eq("id", ctx.scheduledActionId);
      }
      return { ok: true, conversationId };
    }
    case "add_to_sequence": {
      // Enroll the contact: load the sequence, expand its steps into a
      // wait→send_dm chain, and enqueue ONE scheduled-action row. The existing
      // per-minute automation-runner drips it out (each wait re-schedules the
      // tail), so sequences ride the same machinery as inline waits.
      const { data: seq } = await admin
        .from("sequences")
        .select("steps, active, org_id")
        .eq("id", action.sequence_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!seq || seq.org_id !== automation.org_id) {
        return { ok: false, error: "Sequence not found", conversationId };
      }
      if (!seq.active) return { ok: true, conversationId }; // inactive → no-op
      const steps = (Array.isArray(seq.steps) ? seq.steps : []) as Array<{
        delay_minutes?: number;
        message?: string;
      }>;

      // Idempotency: if this exact step already enrolled the contact (a resumed
      // or retried run replays the same stampKey), don't enroll again.
      if (stampKey) {
        const { data: alreadyEnrolled } = await admin
          .from("automation_scheduled_actions")
          .select("id")
          .eq("automation_id", automation.id)
          .eq("contact_id", contact.id)
          .eq("trigger_data->>_enroll_stamp", stampKey)
          .limit(1)
          .maybeSingle();
        if (alreadyEnrolled) return { ok: true, conversationId };
      }

      // Cap concurrent drips per (automation, contact) — same guard as waits, so
      // a re-firing trigger can't pile up unbounded enrollments.
      const { count: inflight } = await admin
        .from("automation_scheduled_actions")
        .select("id", { count: "exact", head: true })
        .eq("automation_id", automation.id)
        .eq("contact_id", contact.id)
        .in("status", ["pending", "processing"]);
      if ((inflight ?? 0) >= MAX_INFLIGHT_PER_CONTACT) {
        return {
          ok: false,
          error: "too many in-flight sequences for this contact; skipped",
          conversationId,
        };
      }

      const chain: Action[] = [];
      for (const s of steps) {
        const mins =
          typeof s.delay_minutes === "number" && s.delay_minutes > 0 ? s.delay_minutes : 0;
        if (mins > 0) chain.push({ type: "wait", ms: mins * 60_000 });
        const text = typeof s.message === "string" ? s.message : "";
        if (text.trim()) chain.push({ type: "send_dm", text });
      }
      if (chain.length === 0) return { ok: true, conversationId }; // empty sequence → no-op

      const { error } = await admin.from("automation_scheduled_actions").insert({
        automation_id: automation.id,
        org_id: automation.org_id,
        contact_id: contact.id,
        channel_id: channel.id,
        conversation_id: conversationId,
        remaining_actions: chain,
        trigger_data: {
          ...(ctx.triggerData ?? {}),
          ...(stampKey ? { _enroll_stamp: stampKey } : {}),
        },
        run_at: new Date().toISOString(),
        status: "pending",
      });
      if (error) return { ok: false, error: error.message, conversationId };
      return { ok: true, conversationId };
    }
    default:
      // Runtime guard: branches are typed LeafAction[], but a hand-crafted API
      // payload could smuggle a wait/condition past TS. Refuse rather than
      // crash on an unhandled shape.
      return { ok: false, error: "Unsupported branch action", conversationId };
  }
}

// Runs a list of actions in order. Leaf actions delegate to execLeafAction.
// `wait` persists the REMAINING actions + STOPS (the runner resumes later).
// `condition` evaluates if/else against the contact's tags + the trigger
// message and runs the chosen branch's leaf actions inline.
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
      if (action.type === "wait") {
        const ms = typeof action.ms === "number" && action.ms > 0 ? action.ms : 0;
        const remaining = actions.slice(i + 1);
        // Zero/negative wait, or nothing after it → no-op, keep running.
        if (ms <= 0 || remaining.length === 0) {
          steps.push({ type: action.type, ok: true });
          continue;
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
          // Scheduling failed — STOP rather than firing the tail immediately.
          steps.push({ type: action.type, ok: false, error: error.message });
          firstFailure ??= error.message;
          return { steps, firstFailure, conversationId, scheduled: false };
        }
        steps.push({ type: action.type, ok: true });
        return { steps, firstFailure, conversationId, scheduled: true };
      }

      if (action.type === "wait_for_reply") {
        // Need a conversation to listen for the reply on.
        if (!conversationId) {
          conversationId = await ensureConversation(admin, channel.org_id, channel.id, contact.id);
        }
        if (!conversationId) {
          steps.push({ type: action.type, ok: false, error: "No conversation to await a reply on" });
          firstFailure ??= "No conversation";
          return { steps, firstFailure, conversationId, scheduled: false };
        }
        const remaining = actions.slice(i + 1);
        if (remaining.length === 0) {
          // Nothing after the wait → pointless; treat as a no-op.
          steps.push({ type: action.type, ok: true });
          continue;
        }
        const { count: inflight } = await admin
          .from("automation_scheduled_actions")
          .select("id", { count: "exact", head: true })
          .eq("automation_id", automation.id)
          .eq("contact_id", contact.id)
          .in("status", ["pending", "processing"]);
        if ((inflight ?? 0) >= MAX_INFLIGHT_PER_CONTACT) {
          steps.push({ type: action.type, ok: false, error: "too many in-flight waits for this contact; skipped" });
          firstFailure ??= "in-flight wait cap reached";
          return { steps, firstFailure, conversationId, scheduled: false };
        }
        // run_at is the TIMEOUT deadline; an inbound resumes it earlier.
        const timeoutMs =
          typeof action.timeout_ms === "number" && action.timeout_ms > 0
            ? Math.min(action.timeout_ms, MAX_WAIT_MS)
            : DEFAULT_REPLY_TIMEOUT_MS;
        const runAt = new Date(Date.now() + timeoutMs).toISOString();
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
          resume_on: "reply",
        });
        if (error) {
          steps.push({ type: action.type, ok: false, error: error.message });
          firstFailure ??= error.message;
          return { steps, firstFailure, conversationId, scheduled: false };
        }
        steps.push({ type: action.type, ok: true });
        return { steps, firstFailure, conversationId, scheduled: true };
      }

      if (action.type === "condition") {
        // STICKY branch choice: on a resumed/retried row, replay the branch we
        // picked the first time. Otherwise a branch leaf that mutated a tag the
        // condition gates on could flip the decision on retry (and double-send
        // across both branches, since their idempotency stamps differ).
        const decisions =
          (ctx.triggerData?._branch_decisions as Record<string, "then" | "else"> | undefined) ?? {};
        const decisionKey = String(i);
        let branchName: "then" | "else";
        if (decisions[decisionKey] === "then" || decisions[decisionKey] === "else") {
          branchName = decisions[decisionKey];
        } else {
          const { data: row } = await admin
            .from("contacts")
            .select("tags")
            .eq("id", contact.id)
            .maybeSingle();
          const tags = (row?.tags ?? []) as string[];
          const messageText =
            typeof ctx.triggerData?.message_text === "string"
              ? (ctx.triggerData.message_text as string)
              : "";
          const repliedByReply = ctx.triggerData?._resumed_by === "reply";
          const replyTimedOut = ctx.triggerData?._reply_timed_out === true;
          branchName = evaluateConditions(action.conditions, action.match, {
            tags,
            messageText,
            repliedByReply,
            replyTimedOut,
          })
            ? "then"
            : "else";
          // Persist the decision so a retry of this scheduled row can't flip it.
          if (ctx.scheduledActionId) {
            const merged = {
              ...(ctx.triggerData ?? {}),
              _branch_decisions: { ...decisions, [decisionKey]: branchName },
            };
            ctx.triggerData = merged;
            await admin
              .from("automation_scheduled_actions")
              .update({ trigger_data: merged })
              .eq("id", ctx.scheduledActionId);
          }
        }
        const branch = branchName === "then" ? action.then : action.else;
        let branchAllOk = true;
        for (let j = 0; j < branch.length; j++) {
          const leaf = branch[j];
          const stampKey = ctx.scheduledActionId
            ? `${ctx.scheduledActionId}:${i}.${branchName}.${j}`
            : null;
          try {
            const r = await execLeafAction(admin, leaf, ctx, conversationId, stampKey);
            conversationId = r.conversationId;
            if (r.ok) {
              steps.push({ type: leaf.type, ok: true });
            } else {
              branchAllOk = false;
              steps.push({ type: leaf.type, ok: false, error: r.error });
              firstFailure ??= r.error ?? "branch action failed";
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            branchAllOk = false;
            steps.push({ type: leaf.type, ok: false, error: msg });
            firstFailure ??= msg;
          }
        }
        // Reflect the branch outcome so a fully-failed branch yields all-ok:false
        // (→ computeStatus 'failed') instead of being masked as success.
        steps.push({ type: action.type, ok: branchAllOk });
        continue;
      }

      if (action.type === "send_buttons") {
        if (!conversationId) {
          conversationId = await ensureConversation(admin, channel.org_id, channel.id, contact.id);
        }
        const r = await execSendButtons(admin, action, ctx, conversationId);
        conversationId = r.conversationId;
        steps.push({ type: action.type, ok: r.ok, error: r.error });
        if (!r.ok) firstFailure ??= r.error ?? "send_buttons failed";
        // Terminal for the inline chain: each button's `then` runs when the
        // user TAPS it (via the webhook), not now. Stop so subsequent inline
        // actions don't fire before the user responds.
        return { steps, firstFailure, conversationId, scheduled: false };
      }

      // Leaf action.
      const stampKey = ctx.scheduledActionId ? `${ctx.scheduledActionId}:${i}` : null;
      const r = await execLeafAction(admin, action, ctx, conversationId, stampKey);
      conversationId = r.conversationId;
      if (r.ok) {
        steps.push({ type: action.type, ok: true });
      } else {
        steps.push({ type: action.type, ok: false, error: r.error });
        firstFailure ??= r.error ?? "action failed";
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      steps.push({ type: action.type, ok: false, error: msg });
      firstFailure ??= msg;
    }
  }

  return { steps, firstFailure, conversationId, scheduled: false };
}

// Sends an Instagram opt-in message with quick-reply buttons. Each button's
// `then` actions run later, when the user taps it (handled by runButtonTap from
// the webhook). On a comment trigger, the prompt goes out as a private reply.
async function execSendButtons(
  admin: ReturnType<typeof createAdminClient>,
  action: Extract<Action, { type: "send_buttons" }>,
  ctx: ActionCtx,
  conversationId: string | null,
): Promise<{ ok: boolean; error?: string; conversationId: string | null }> {
  const { automation, contact, channel } = ctx;
  let convId = conversationId;
  if (!convId) convId = await ensureConversation(admin, channel.org_id, channel.id, contact.id);
  if (!convId) return { ok: false, error: "No conversation", conversationId: convId };
  if (channel.type !== "instagram") {
    return { ok: false, error: "Buttons are only supported on Instagram channels", conversationId: convId };
  }
  const buttons = (action.buttons ?? []).slice(0, 3); // ≤3 for UX (Meta allows 13)
  if (buttons.length === 0) {
    return { ok: false, error: "No buttons configured", conversationId: convId };
  }
  const td = ctx.triggerData as Record<string, string | null | undefined>;
  const text = renderTemplate(action.text, contact, td);
  const quickReplies = buttons.map((b) => ({
    title: renderTemplate(b.title, contact, td),
    // payload references the button by its STABLE id — position-independent, so
    // a resumed/post-wait run or a later edit can't misroute the tap.
    payload: `xyra_btn:${automation.id}:${b.id}`,
  }));
  const commentId = consumeCommentReply(ctx, channel.type);
  const send = await sendChannelMessage({
    channel,
    recipient: pickRecipient(channel.type, contact),
    content: text,
    conversationId: convId,
    commentId,
    quickReplies,
    extraMetadata: {
      automation_meta: { name: automation.name, trigger_type: automation.trigger_type },
      button_prompt: true,
    },
  });
  return send.ok
    ? { ok: true, conversationId: convId }
    : { ok: false, error: send.error ?? "send failed", conversationId: convId };
}

// Called from the IG webhook when a user TAPS a quick-reply opt-in button. Runs
// that button's `then` actions — the tap just opened the 24h messaging window,
// so the follow-up sends (e.g. the link) go out as normal RESPONSE messages.
// Tenant-guarded (channel + contact must belong to the automation's org).
// Best-effort; never throws.
export async function runButtonTap(input: {
  automationId: string;
  buttonId: string;
  contactId: string;
  channelId: string;
  conversationId: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  try {
    const { data: automationRow } = await admin
      .from("automations")
      .select("*")
      .eq("id", input.automationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!automationRow || !automationRow.active) return;
    const automation = automationRow as AutomationRow;
    // Resolve the button by its STABLE id across all send_buttons actions —
    // never by position (which shifts after an edit or on a resumed run).
    let button: { id: string; title: string; then: LeafAction[] } | undefined;
    for (const a of automation.actions ?? []) {
      if (a.type === "send_buttons") {
        const found = a.buttons?.find((b) => b.id === input.buttonId);
        if (found) {
          button = found;
          break;
        }
      }
    }
    if (!button || !Array.isArray(button.then) || button.then.length === 0) return;

    const [{ data: channel }, { data: contact }] = await Promise.all([
      admin
        .from("channels")
        .select("id, type, org_id, phone_number_id, page_id, ig_business_account_id, access_token_vault_id, metadata")
        .eq("id", input.channelId)
        .maybeSingle(),
      admin
        .from("contacts")
        .select("id, org_id, name, phone, email, instagram_id, telegram_id, messenger_id")
        .eq("id", input.contactId)
        .maybeSingle(),
    ]);
    if (!channel || channel.org_id !== automation.org_id) return;
    if (!contact || contact.org_id !== automation.org_id) return;

    const ctx: ActionCtx = {
      automation,
      contact: contact as ExecContact,
      channel: channel as ExecChannel,
      conversationId: input.conversationId,
      triggerData: { _button_tap: true, button_title: button.title },
    };
    let convId = ctx.conversationId;
    for (let j = 0; j < button.then.length; j++) {
      try {
        // Idempotency: a redelivered tap webhook OR a double-tap must not
        // re-send the link. Stamp each follow-up with a stable key (per
        // button + contact + step); execLeafAction skips if already sent.
        const stampKey = `tap:${input.automationId}:${input.buttonId}:${input.contactId}:${j}`;
        const r = await execLeafAction(admin, button.then[j], ctx, convId, stampKey);
        convId = r.conversationId;
      } catch (err) {
        console.warn("[automations] button-tap action failed", err);
      }
    }
  } catch (err) {
    console.error("[automations] runButtonTap failed", err);
  }
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

  // Outbound webhook event for external integrations (connectors advertise
  // "Automation fired"). Fire-and-forget so a slow delivery can't block.
  void emit({
    type: "automation.fired",
    orgId: automation.org_id,
    data: {
      automation_id: automation.id,
      automation_name: automation.name,
      contact_id: contact.id,
      conversation_id: r.conversationId,
      status,
    },
  }).catch(() => {});

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
  resume_on?: string;
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
      .select("id, org_id, name, phone, email, instagram_id, telegram_id, messenger_id")
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

  // Effective trigger data. A reply-wait row that the TIMER fired (no inbound
  // arrived in time) is a TIMEOUT — flag it so the flow can take a no-reply
  // path. A reply-RESUME (resumeWaitingReplies) already stamped message_text +
  // _resumed_by='reply' into trigger_data at claim time.
  let triggerData = row.trigger_data ?? {};
  if (
    row.resume_on === "reply" &&
    (triggerData as Record<string, unknown>)._resumed_by !== "reply"
  ) {
    // Clear any stale trigger message_text (e.g. the original keyword) so the
    // no-reply path isn't tricked into a message-match, mark timed-out, and
    // record that the timeout took over.
    triggerData = { ...triggerData, _reply_timed_out: true, _resumed_by: "timeout", message_text: "" };
    // Durably take the row OFF the reply path so a late inbound can't re-claim
    // it after a failed timeout-resume returns it to pending. resumeWaitingReplies
    // filters resume_on='reply'; flipping to 'timer' makes it invisible there.
    await admin
      .from("automation_scheduled_actions")
      .update({ resume_on: "timer", trigger_data: triggerData })
      .eq("id", row.scheduled_action_id);
  }

  const r = await runActionList(admin, row.remaining_actions ?? [], {
    automation: automation as AutomationRow,
    contact: contact as ExecContact,
    channel: channel as ExecChannel,
    triggerData,
    conversationId: row.conversation_id ?? null,
    scheduledActionId: row.scheduled_action_id,
  });
  // On the resume path, ANY failure is retryable: every send is stamped
  // (sched_step) so re-running already-landed steps is a no-op. So we return
  // 'failed' on any firstFailure (not only all-failed) and let the runner
  // retry up to MAX_ATTEMPTS.
  const status: ExecResult["status"] = r.firstFailure ? "failed" : "success";

  // Continuation log row (so the detail page shows the resumed steps). We do
  // NOT bump run_count (same trigger) or failure_count here — counters are a
  // per-trigger measure owned by the initial fire; the runner records terminal
  // outcomes on the scheduled row (last_error/status) and bumps failure_count
  // once when a chain is finally parked failed.
  await admin.from("automation_logs").insert({
    automation_id: automation.id,
    contact_id: contact.id,
    conversation_id: r.conversationId,
    trigger_data: row.trigger_data ?? {},
    steps: r.steps,
    status,
    error_message: r.firstFailure,
  });

  return { status, steps: r.steps, error_message: r.firstFailure };
}

// Resume any automations parked waiting for THIS contact's reply on THIS
// conversation. Called once per inbound from the webhook handlers. Stamps the
// reply text into the row (message_text + _resumed_by) at claim time so the
// resumed flow — and any retry — branches on the reply. Fire-and-forget.
export async function resumeWaitingReplies(
  conversationId: string,
  replyText: string,
): Promise<void> {
  if (!conversationId) return;
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("automation_scheduled_actions")
    .select(
      "id, automation_id, org_id, contact_id, channel_id, conversation_id, remaining_actions, trigger_data, resume_on, attempts",
    )
    .eq("conversation_id", conversationId)
    .eq("resume_on", "reply")
    .eq("status", "pending")
    // Only rows whose timeout deadline hasn't passed — never reply-claim an
    // already-elapsed row (the timer owns it on the no-reply path).
    .gt("run_at", new Date().toISOString())
    .limit(20);

  for (const row of rows ?? []) {
    // Atomic claim — stamp the reply in the SAME update so a retry (and the
    // sticky condition logic) sees it, and only one claimer wins vs the timer.
    const mergedTd = {
      ...((row.trigger_data ?? {}) as Record<string, unknown>),
      message_text: replyText,
      _resumed_by: "reply",
    };
    const { data: claimed } = await admin
      .from("automation_scheduled_actions")
      .update({ status: "processing", trigger_data: mergedTd, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // the timer (timeout) or another inbound won the claim

    const attempts = row.attempts + 1;
    try {
      const result = await resumeAutomation({
        scheduled_action_id: row.id,
        automation_id: row.automation_id,
        org_id: row.org_id,
        contact_id: row.contact_id,
        channel_id: row.channel_id,
        conversation_id: row.conversation_id,
        remaining_actions: (row.remaining_actions ?? []) as Action[],
        trigger_data: mergedTd,
        resume_on: "reply",
      });
      // On failure, retry via the timer: back to pending + run_at=now so the
      // per-minute runner re-runs it soon. _resumed_by='reply' is persisted, so
      // the retry stays on the reply path (not treated as a timeout).
      const failed = result.status === "failed";
      await admin
        .from("automation_scheduled_actions")
        .update(
          failed && attempts < MAX_RESUME_ATTEMPTS
            ? { status: "pending", run_at: new Date().toISOString(), last_error: result.error_message, attempts, updated_at: new Date().toISOString() }
            : { status: failed ? "failed" : "done", last_error: result.error_message, attempts, updated_at: new Date().toISOString() },
        )
        .eq("id", row.id);
    } catch (err) {
      await admin
        .from("automation_scheduled_actions")
        .update({
          status: attempts >= MAX_RESUME_ATTEMPTS ? "failed" : "pending",
          run_at: new Date().toISOString(),
          last_error: err instanceof Error ? err.message : "resume error",
          attempts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }
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
  // IG only: when set, send as a private reply to this comment
  // (recipient: { comment_id }) instead of recipient: { id } — reaches a
  // commenter who has no open 24h messaging window.
  commentId?: string;
  // IG only: quick-reply opt-in buttons attached to the message. Tapping one
  // posts its title back + fires its payload to our webhook.
  quickReplies?: Array<{ title: string; payload: string }>;
}): Promise<{ ok: boolean; error?: string }> {
  const { channel, recipient, content, conversationId } = input;
  const msgMetadata = { automation: true, ...(input.extraMetadata ?? {}) };
  // A comment private-reply addresses the comment_id, not the contact handle.
  if (!recipient && !input.commentId) return { ok: false, error: "Contact has no handle for this channel" };

  const admin = createAdminClient();
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "Empty message" };

  // Email uses Resend (no Vault token) — handle it before the token check.
  if (channel.type === "email") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { ok: false, error: "RESEND_API_KEY not configured" };
    const [{ data: ch }, { data: lastInbound }] = await Promise.all([
      admin.from("channels").select("inbox_email, metadata, name").eq("id", channel.id).maybeSingle(),
      admin
        .from("messages")
        .select("email_message_id, metadata")
        .eq("conversation_id", conversationId)
        .eq("direction", "inbound")
        .not("email_message_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const chMeta = (ch?.metadata ?? {}) as { from_name?: string };
    const fromName = chMeta.from_name ?? ch?.name ?? "Xyra Chat";
    const fromAddress = ch?.inbox_email ?? process.env.EMAIL_FROM_ADDRESS ?? "support@xyrachat.com";
    const priorEmail = (lastInbound?.metadata as { email?: { subject?: string; references?: string[] } } | null)?.email;
    const inReplyTo = lastInbound?.email_message_id ?? undefined;
    const references = inReplyTo ? [...(priorEmail?.references ?? []), inReplyTo] : undefined;
    let subject = priorEmail?.subject ?? ch?.name ?? "Message";
    if (!/^re:/i.test(subject)) subject = `Re: ${subject}`;
    const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN ?? "mail.xyrachat.com";
    const outboundMessageId = `<${crypto.randomUUID()}@${inboundDomain}>`;
    const { Resend } = await import("resend");
    const sendRes = await new Resend(apiKey).emails.send({
      from: `${fromName} <${fromAddress}>`,
      to: recipient,
      subject,
      text: trimmed,
      headers: {
        "Message-ID": outboundMessageId,
        ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
        ...(references && references.length ? { References: references.join(" ") } : {}),
      },
    });
    if (sendRes.error) return { ok: false, error: sendRes.error.message };
    await admin.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      content: trimmed,
      sender_type: "bot",
      status: "sent",
      email_message_id: outboundMessageId,
      metadata: {
        ...msgMetadata,
        email: { subject, from_address: fromAddress, from_name: fromName, to_addresses: [recipient], message_id: outboundMessageId, in_reply_to: inReplyTo, references },
        resend_id: sendRes.data?.id ?? null,
      },
    });
    await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
    return { ok: true };
  }

  if (!channel.access_token_vault_id) return { ok: false, error: "Channel token missing" };
  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) return { ok: false, error: "Channel token unreadable" };

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
    const igMessage: Record<string, unknown> = { text: trimmed };
    if (input.quickReplies?.length) {
      igMessage.quick_replies = input.quickReplies.slice(0, 13).map((q) => ({
        content_type: "text",
        title: q.title.slice(0, 20),
        payload: q.payload,
      }));
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        input.commentId
          ? {
              // Private reply to a comment — reaches a commenter with no open
              // 24h window (allowed once per comment, within 7 days).
              recipient: { comment_id: input.commentId },
              message: igMessage,
            }
          : {
              recipient: { id: recipient },
              messaging_type: "RESPONSE",
              message: igMessage,
            },
      ),
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

  if (channel.type === "facebook") {
    // recipient is the contact's messenger_id (PSID); send via the Page.
    if (!channel.page_id) return { ok: false, error: "Channel missing page_id" };
    const res = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.page_id}/messages`,
      {
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
      },
    );
    const json = (await res.json().catch(() => null)) as {
      message_id?: string;
      error?: { message: string };
    } | null;
    if (!res.ok || json?.error) {
      return { ok: false, error: json?.error?.message ?? `Messenger API HTTP ${res.status}` };
    }
    await admin.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      content: trimmed,
      sender_type: "bot",
      status: "sent",
      messenger_message_id: json?.message_id ?? null,
      metadata: msgMetadata,
    });
    await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
    return { ok: true };
  }

  if (channel.type === "webchat") {
    // No external provider — store the outbound row; the visitor's widget polls
    // it. recipient is a sentinel (the conversation already targets the visitor).
    await admin.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      content: trimmed,
      sender_type: "bot",
      status: "sent",
      metadata: msgMetadata,
    });
    await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
    return { ok: true };
  }

  return { ok: false, error: `Send not implemented for ${channel.type}` };
}

function pickRecipient(
  channelType: string,
  contact: {
    phone: string | null;
    email: string | null;
    instagram_id: string | null;
    telegram_id: string | null;
    messenger_id: string | null;
  },
): string {
  switch (channelType) {
    case "whatsapp":
      return contact.phone ?? "";
    case "instagram":
      return contact.instagram_id ?? "";
    case "telegram":
      return contact.telegram_id ?? "";
    case "facebook":
      return contact.messenger_id ?? "";
    case "email":
      return contact.email ?? "";
    case "webchat":
      return "webchat"; // sentinel: send target is the conversation, not a handle
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
