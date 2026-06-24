import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateBotResponse,
  pickHandoffMessage,
  type BotRow,
  type ConversationMessage,
} from "@/lib/ai/chatbot";
import { isAnthropicConfigured } from "@/lib/ai/clients";
import { checkAiQuota, consumeAiTokens } from "@/lib/billing/usage";
import { selectEnabledTools, executeTool, type ToolExecContext } from "@/lib/ai/tools";
import { transcribeInboundAudio } from "@/lib/ai/transcription";
import { emit } from "@/lib/api/emit";
import type { EventType } from "@/lib/api/events";

// Bot outcome type → outbound webhook event. Connectors advertise these as
// triggers, so the live bot must emit them (the manual API route alone didn't).
const OUTCOME_EVENT: Record<string, EventType> = {
  lead_captured: "bot.lead_captured",
  link_clicked: "bot.link_clicked",
  qualified: "bot.qualified",
};

// Channels supported by the bot gate. The gate is provider-agnostic — it
// runs the same 6-gate decision tree for each — but a few gates need to
// know the channel type (WA 24h window, send endpoint).
export type ProviderChannel = "whatsapp" | "instagram" | "telegram" | "facebook" | "webchat" | "email";

export type BotGateInput = {
  channel: {
    id: string;
    type: string;
    org_id: string;
  };
  conversationId: string;
  contactId: string;
  newMessage: {
    content: string | null;
    media_type: string | null;
    isFirstFromContact: boolean;
    // Set for audio inbound so Gate 6 can transcribe: media_url is the
    // provider media reference (WA media_id / TG file_id / IG url), messageId
    // is the stored row to write the transcript back to.
    media_url?: string | null;
    messageId?: string | null;
  };
};

export type BotGateResult =
  | { skipped: true; reason: string }
  | { skipped: false; sent: boolean; handoff: boolean };

// The bot gate runs AFTER an inbound is logged to messages but BEFORE we
// return 200 to the provider. It's called fire-and-forget from each
// webhook handler so processing time doesn't push the webhook past 5s.
//
// Six sequential gates — first hit short-circuits. All log to bot_outcomes
// with a clear `payload.reason` so the analytics page can show what's
// blocking the bot (Week 8).
export async function runBotGate(input: BotGateInput): Promise<BotGateResult> {
  const admin = createAdminClient();

  // ---- Per-conversation bot control (migration 040) -------------------
  // Read once up front: bot_only (affects Gates 2 + 3 below) and an explicit
  // per-conversation bot override (resolved in Gate 1).
  const { data: convControl } = await admin
    .from("conversations")
    .select("bot_only, bot_id_override")
    .eq("id", input.conversationId)
    .maybeSingle();
  const botOnly = Boolean(convControl?.bot_only);

  // ---- GATE 1: which bot (if any) handles this conversation? -----------
  // An agent can PIN a specific bot to this conversation (bot_id_override),
  // which bypasses channel routing entirely. We honor it only when it still
  // resolves to an active, non-deleted bot in this org; otherwise (unset or
  // stale) we fall back to channel assignment + intent routing.
  let chosenBotId: string | null = null;
  if (convControl?.bot_id_override) {
    const { data: pinned } = await admin
      .from("bots")
      .select("id")
      .eq("id", convControl.bot_id_override)
      .eq("org_id", input.channel.org_id) // tenant guard at selection time
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (pinned) chosenBotId = pinned.id;
  }

  // Multiple bots can share a channel. A single-bot channel skips routing
  // entirely (zero added cost, original behavior). With >1, a Haiku classifier
  // routes the inbound to the best match by routing_description, made STICKY
  // per conversation (conversations.routed_bot_id) so it runs ~once and the
  // chat doesn't bounce between bots. The classifier cost is charged inline at
  // spend (below), so there's no token total to thread to the final consume.
  // Skipped wholesale when a valid override pinned the bot above.
  if (!chosenBotId) {
  const { data: assignments } = await admin
    .from("bot_assignments")
    .select("bot_id, routing_description")
    .eq("channel_id", input.channel.id)
    .eq("active", true);
  if (!assignments || assignments.length === 0) {
    return { skipped: true, reason: "no_bot_assigned" };
  }

  if (assignments.length === 1) {
    chosenBotId = assignments[0].bot_id;
  } else {
    // Only route among bots that are still active + not deleted. Ordered so
    // the "default bot" (candidates[0], used on no-text / classifier-failure
    // fallbacks) is stable across turns: oldest assigned bot wins.
    const { data: candBots } = await admin
      .from("bots")
      .select("id, name, objective, created_at")
      .in("id", assignments.map((a) => a.bot_id))
      .eq("active", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    const candidates = candBots ?? [];
    if (candidates.length === 0) {
      return { skipped: true, reason: "bot_inactive_or_deleted" };
    }
    if (candidates.length === 1) {
      chosenBotId = candidates[0].id;
    } else {
      // Sticky: reuse the conversation's prior routing if still a candidate.
      const { data: convRoute } = await admin
        .from("conversations")
        .select("routed_bot_id")
        .eq("id", input.conversationId)
        .maybeSingle();
      const stickyId =
        convRoute?.routed_bot_id &&
        candidates.some((c) => c.id === convRoute.routed_bot_id)
          ? (convRoute.routed_bot_id as string)
          : null;
      if (stickyId) {
        chosenBotId = stickyId;
      } else {
        const routingText = input.newMessage.content?.trim() ?? "";
        if (routingText) {
          const { classifyBot } = await import("@/lib/ai/router");
          const route = await classifyBot({
            candidates: candidates.map((c) => ({
              id: c.id,
              name: c.name,
              objective: c.objective,
              routingDescription:
                assignments.find((a) => a.bot_id === c.id)?.routing_description ?? null,
            })),
            message: routingText,
          });
          // Charge the classifier the instant it's spent — many gates below can
          // skip, and we'd otherwise drop the cost (the budget invariant).
          if (route.classifierTokens > 0) {
            await consumeAiTokens(input.channel.org_id, route.classifierTokens);
          }
          const myChoice = route.botId || candidates[0].id;
          // First-writer-wins CAS: only claim routing if nobody has yet. Two
          // concurrent first inbounds would otherwise classify independently
          // (Haiku is non-deterministic) and answer as DIFFERENT bots. The
          // loser adopts the winner's bot so both turns use one persona.
          const { data: claimed, error: claimErr } = await admin
            .from("conversations")
            .update({ routed_bot_id: myChoice })
            .eq("id", input.conversationId)
            .is("routed_bot_id", null)
            .select("routed_bot_id")
            .maybeSingle();
          if (claimErr) {
            console.warn("[bot-gate] sticky-route claim failed", {
              conversationId: input.conversationId,
              claimErr,
            });
          }
          if (claimed?.routed_bot_id) {
            chosenBotId = claimed.routed_bot_id as string; // we won the claim
          } else {
            // Someone claimed first — adopt the persisted winner so both
            // concurrent turns converge on the same bot.
            const { data: winner } = await admin
              .from("conversations")
              .select("routed_bot_id")
              .eq("id", input.conversationId)
              .maybeSingle();
            chosenBotId =
              winner?.routed_bot_id &&
              candidates.some((c) => c.id === winner.routed_bot_id)
                ? (winner.routed_bot_id as string)
                : myChoice;
          }
        } else {
          // No text to classify on (e.g. a voice note, transcribed later at
          // Gate 6) → use the default bot for THIS turn but DON'T persist, so a
          // later text turn still gets properly routed by intent.
          chosenBotId = candidates[0].id;
        }
      }
    }
  }
  } // end: channel assignment + routing (skipped when an override pinned the bot)

  // Defensive: every branch above either assigns chosenBotId or returns, but
  // narrow the type for the fetch below.
  if (!chosenBotId) return { skipped: true, reason: "no_bot_assigned" };

  const { data: bot } = await admin
    .from("bots")
    .select("*")
    .eq("id", chosenBotId)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bot) return { skipped: true, reason: "bot_inactive_or_deleted" };

  // ---- TENANT-ISOLATION GUARD ----------------------------------------
  // The setChannelAssignment() server action verifies bot.org_id ===
  // channel.org_id before inserting. Migration 019 also installs a
  // BEFORE INSERT/UPDATE trigger that refuses cross-org rows at the DB
  // level. This third check is belt-and-suspenders: if either layer
  // somehow fails (manual SQL, restore from an old backup, future bug),
  // the bot still refuses to run and we never leak one org's knowledge
  // base into another org's conversation. Fail loudly to bot_outcomes
  // so the support tool can flag the assignment.
  if (bot.org_id !== input.channel.org_id) {
    console.error(
      "[bot-gate] cross-org assignment detected — refusing to run",
      { bot_id: bot.id, bot_org: bot.org_id, channel_org: input.channel.org_id },
    );
    return { skipped: true, reason: "cross_org_assignment_refused" };
  }

  // ---- GATE 2: auto-pause when a human just replied -------------------
  // If an agent (not a bot) wrote outbound in the last 6 hours, the human
  // has taken over. Don't talk on top of them. Internal notes don't count
  // — they never reach the customer, so they shouldn't suppress the bot.
  // bot_only conversations skip this: the funnel is fully automated, so an
  // earlier agent reply (before bot_only was switched on) shouldn't mute the bot.
  if (!botOnly) {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: recentAgent } = await admin
    .from("messages")
    .select("created_at, sender_type")
    .eq("conversation_id", input.conversationId)
    .eq("direction", "outbound")
    .eq("sender_type", "agent")
    .eq("is_internal_note", false)
    .gte("created_at", sixHoursAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentAgent) {
    return { skipped: true, reason: "auto_pause_agent_active" };
  }
  }

  // ---- GATE 3: conversation status --------------------------------
  // Allowed: status in (bot, open) AND assigned_to IS NULL. A bot_only
  // conversation ignores the assigned check — the bot owns the funnel even if
  // it's nominally assigned to someone.
  const { data: conv } = await admin
    .from("conversations")
    .select("status, assigned_to, last_inbound_at")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (!conv) return { skipped: true, reason: "conversation_missing" };
  if (conv.assigned_to && !botOnly) return { skipped: true, reason: "conversation_assigned" };
  if (conv.status === "closed") {
    // A new inbound on a closed chat normally stays closed. When the bot has
    // auto_reopen_closed on, reopen it so the bot picks the thread back up.
    if ((bot as BotRow).auto_reopen_closed) {
      await admin
        .from("conversations")
        .update({ status: "open" })
        .eq("id", input.conversationId);
    } else {
      return { skipped: true, reason: "status_closed" };
    }
  } else if (conv.status !== "bot" && conv.status !== "open") {
    return { skipped: true, reason: `status_${conv.status}` };
  }

  // ---- GATE 4: business hours -------------------------------------
  // A per-channel schedule (bot_assignments.business_hours) overrides the bot's
  // own hours for THIS channel — e.g. the bot on WA 9-5 but IG 24/7. Falls back
  // to bots.business_hours when there's no override (NULL). On the override path
  // there may be no assignment row at all → also falls back to the bot's hours.
  const { data: channelAssignment } = await admin
    .from("bot_assignments")
    .select("business_hours")
    .eq("channel_id", input.channel.id)
    .eq("bot_id", bot.id)
    .maybeSingle();
  const hours = ((channelAssignment?.business_hours ?? bot.business_hours) ?? {}) as {
    active?: boolean;
    timezone?: string;
    [day: string]: unknown;
  };
  if (hours.active) {
    const tz = hours.timezone ?? "UTC";
    // Fail SAFE: a bad/renamed IANA zone makes Intl throw. Sanitize already
    // rejects invalid zones on save, but an Intl edge or legacy row shouldn't
    // crash the gate (the throw would abort the rest of the webhook batch).
    // On error treat as within-hours so the bot keeps replying.
    let within = true;
    try {
      within = isWithinHours(hours, tz, new Date());
    } catch (err) {
      console.warn("[bot-gate] business-hours eval failed; treating as open", { tz, err });
      within = true;
    }
    if (!within) {
      // Always acknowledge (never dead silence) — fall back to a sane default
      // when the operator left off_hours_message empty.
      const offHoursContent = bot.off_hours_message || DEFAULT_OFF_HOURS_MESSAGE;
      // WhatsApp free-form text is only deliverable inside the 24h window — this
      // gate runs BEFORE Gate 5, so guard it here (an undeliverable send would
      // just error at Meta).
      const waOpen =
        input.channel.type !== "whatsapp" ||
        (conv.last_inbound_at
          ? Date.now() - new Date(conv.last_inbound_at).getTime() <
            24 * 60 * 60 * 1000
          : false);
      // At most one off-hours reply per ~12h so a midnight burst of messages
      // doesn't trigger N identical "we're closed" auto-replies.
      const recentlyAcked = await botFlagExists(
        admin,
        input.conversationId,
        "off_hours",
        12 * 60 * 60 * 1000,
      );
      if (waOpen && !recentlyAcked) {
        await sendOutbound(input.channel.type, {
          conversationId: input.conversationId,
          content: offHoursContent,
          botMetadata: { off_hours: true },
          channelId: input.channel.id,
          contactId: input.contactId,
        });
        await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
          reason: "off_hours_message_sent",
        });
        return { skipped: false, sent: true, handoff: false };
      }
      await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
        reason: recentlyAcked ? "off_hours_deduped" : "off_hours_undeliverable",
      });
      return { skipped: true, reason: "off_hours" };
    }
  }

  // ---- GATE 5: WhatsApp 24h customer-service window ---------------
  if (input.channel.type === "whatsapp") {
    const lastInbound = conv.last_inbound_at
      ? new Date(conv.last_inbound_at).getTime()
      : 0;
    const open = Date.now() - lastInbound < 24 * 60 * 60 * 1000;
    if (!open) {
      await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
        reason: "wa_24h_window_closed",
      });
      return { skipped: true, reason: "wa_24h_window_closed" };
    }
  }

  // ---- GATE 5b: per-contact/conversation flood guard ------------
  // Bound runaway AI spend from a hostile inbound flood BEFORE any spend
  // (voice transcription / vision / generation), keyed per contact + conversation.
  {
    const { aiInboundAllowed } = await import("@/lib/ai/flood-guard");
    if (
      !(await aiInboundAllowed(input.channel.org_id, input.contactId, input.conversationId))
    ) {
      await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
        reason: "ai_flood_guard",
      });
      return { skipped: true, reason: "ai_flood_guard" };
    }
  }

  // ---- GATE 6: voice transcription --------------------------------
  // If the inbound is audio with no text, transcribe via Whisper before the
  // bot sees it, and write the transcript back to the message row in-place so
  // the inbox + future re-reads treat it as text.
  let queryText = input.newMessage.content?.trim() ?? "";
  if (!queryText && input.newMessage.media_type === "audio") {
    const mediaRef = input.newMessage.media_url ?? null;
    const messageId = input.newMessage.messageId ?? null;
    if (!mediaRef || !messageId) {
      await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
        reason: "voice_no_media_ref",
      });
      return { skipped: true, reason: "voice_no_media_ref" };
    }
    // Transcription spends the org AI budget — pre-flight before calling Whisper.
    const voiceQuota = await checkAiQuota(input.channel.org_id);
    if (!voiceQuota.ok) {
      await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
        reason: "token_budget_exhausted",
      });
      return { skipped: true, reason: "token_budget_exhausted" };
    }
    const transcript = await transcribeInboundAudio({
      channelType: input.channel.type,
      channelId: input.channel.id,
      mediaRef,
      admin,
    });
    if (!transcript) {
      await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
        reason: "voice_transcription_failed",
      });
      // Don't drop a voice note silently — ask the customer to type it.
      await degradeGracefully({
        admin,
        input,
        bot: bot as BotRow,
        reason: "voice_transcription_failed",
        content: DEFAULT_MEDIA_UNREADABLE_MESSAGE,
        flag: "media_unreadable_ack",
        escalate: false,
        clearBotOnly: false,
        canSendToCustomer: true,
      });
      return { skipped: true, reason: "voice_transcription_failed" };
    }
    // Persist atomically (server-side JSONB merge + idempotent). The RPC
    // returns the id only to the writer that actually set the transcript, so
    // we charge the budget exactly once even if the on-demand path races us.
    const { data: wroteId } = await admin.rpc("set_message_transcription", {
      p_message_id: messageId,
      p_text: transcript.text,
      p_model: transcript.model,
    });
    if (wroteId) {
      await consumeAiTokens(input.channel.org_id, transcript.budgetTokens);
    }
    queryText = transcript.text;
  }

  // ---- GATE 6b: inbound image → vision -----------------------------------
  // When the inbound is an image, fetch + prepare it so the bot can "see" it.
  // queryText is the caption (may be empty for an image-only message).
  let inboundImage: { base64: string; mime: string } | null = null;
  if (input.newMessage.media_type === "image" && input.newMessage.media_url) {
    const { prepareInboundImage } = await import("@/lib/ai/vision");
    inboundImage = await prepareInboundImage({
      channelType: input.channel.type,
      channelId: input.channel.id,
      mediaRef: input.newMessage.media_url,
      admin,
    });
  }

  if (!queryText && !inboundImage) {
    // The customer sent something we can't read (image fetch failed, or a
    // video/sticker/document we don't process). Acknowledge instead of going
    // silent so they know it arrived and how to proceed.
    if (input.newMessage.media_type) {
      await degradeGracefully({
        admin,
        input,
        bot: bot as BotRow,
        reason: "media_unreadable",
        content: DEFAULT_MEDIA_UNREADABLE_MESSAGE,
        flag: "media_unreadable_ack",
        escalate: false,
        clearBotOnly: false,
        canSendToCustomer: true,
      });
    }
    return { skipped: true, reason: "no_text_to_respond_to" };
  }

  // ---- GATE 7: per-org monthly AI token budget -----------------------
  // Pre-flight check (consume amount=0). If exhausted, log + skip.
  // Real consumption happens AFTER the provider call so we charge the
  // exact tokens billed.
  const quota = await checkAiQuota(input.channel.org_id);
  if (!quota.ok) {
    await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
      reason: "token_budget_exhausted",
      plan: quota.plan,
      tokens_used: quota.tokens_used_this_month,
      limit: quota.monthly_ai_tokens_limit,
    });
    // Budget is transient (resets monthly) — acknowledge + surface to a human,
    // but keep bot_only so the bot resumes automatically once the cap clears.
    // Static copy (no AI call) so we don't re-spend against the exhausted budget.
    await degradeGracefully({
      admin,
      input,
      bot: bot as BotRow,
      reason: "token_budget_exhausted",
      content: botHandoffCopy(bot as BotRow),
      // Transient (resets monthly) → keep bot_only so the bot auto-resumes when
      // the budget clears; its own flag so it doesn't block other failures.
      flag: "ack_budget",
      escalate: true,
      clearBotOnly: false,
      canSendToCustomer: true,
    });
    return { skipped: true, reason: "token_budget_exhausted" };
  }

  if (!isAnthropicConfigured()) {
    await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
      reason: "anthropic_not_configured",
    });
    await degradeGracefully({
      admin,
      input,
      bot: bot as BotRow,
      reason: "anthropic_not_configured",
      content: botHandoffCopy(bot as BotRow),
      // A missing API key is NOT transient (won't self-resolve per-conversation,
      // needs operator action) → hand the funnel to a human, own flag.
      flag: "ack_config",
      escalate: true,
      clearBotOnly: true,
      canSendToCustomer: true,
    });
    return { skipped: true, reason: "anthropic_not_configured" };
  }

  // ---- Greeting: first message ever from this contact ---------------
  // The caller doesn't always know this cheaply (find-or-create-contact
  // races), so we double-check here: count prior inbound messages for
  // this contact. If this is genuinely the first, send the greeting
  // first as a separate bot message.
  if (bot.greeting_message) {
    const { count: priorInboundCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", input.conversationId)
      .eq("direction", "inbound");
    // The current inbound just landed → 1 inbound row means it's the first.
    if (input.newMessage.isFirstFromContact || (priorInboundCount ?? 0) <= 1) {
      // Don't send the greeting twice on retries / repeated inbound. Check
      // for an existing bot message marked greeting=true on this thread.
      const { count: greetingCount } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", input.conversationId)
        .eq("sender_type", "bot")
        .filter("metadata->>greeting", "eq", "true");
      if ((greetingCount ?? 0) === 0) {
        await sendOutbound(input.channel.type, {
          conversationId: input.conversationId,
          content: bot.greeting_message,
          botMetadata: { greeting: true },
          channelId: input.channel.id,
          contactId: input.contactId,
        });
      }
    }
  }

  // ---- Fetch context + generate -----------------------------------
  // Last 10 messages (oldest → newest), org name for the prompt.
  const [{ data: msgs }, { data: org }] = await Promise.all([
    admin
      .from("messages")
      .select("direction, content, sender_type, created_at")
      .eq("conversation_id", input.conversationId)
      // Never feed private agent notes to the model (they're outbound/agent
      // rows that would otherwise look like the bot's own prior turns), and
      // skip soft-deleted rows. Matches Gate 2 + the webchat-poll contract.
      .eq("is_internal_note", false)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("organizations")
      .select("name")
      .eq("id", input.channel.org_id)
      .maybeSingle(),
  ]);
  const recent = ((msgs ?? []) as ConversationMessage[]).slice().reverse();

  // Tool use: assemble the bot's enabled tools + a tenant-scoped executor.
  // The executor takes every id from this server-built context — never from
  // the model's tool input — so a tool can only ever touch THIS org's
  // contact/conversation (org_id is already proven === bot.org_id above).
  const tools = selectEnabledTools((bot as BotRow).tools_config);
  const toolCtx: ToolExecContext = {
    admin,
    orgId: input.channel.org_id,
    botId: bot.id,
    conversationId: input.conversationId,
    contactId: input.contactId,
    knowledgeThreshold: (bot as BotRow).knowledge_threshold,
  };

  let result;
  const genStart = Date.now();
  try {
    result = await generateBotResponse({
      bot: bot as BotRow,
      orgName: org?.name ?? "us",
      recentMessages: recent,
      newMessage: queryText,
      tools,
      executeTool:
        tools.length > 0
          ? (name, toolInput) => executeTool(name, toolInput, toolCtx)
          : undefined,
      image: inboundImage ?? undefined,
    });
  } catch (err) {
    console.error("[bot-gate] generateBotResponse threw", err);
    await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
      reason: "generate_threw",
      error: err instanceof Error ? err.message : String(err),
    });
    // Never greet-then-ghost. Acknowledge + escalate to a human. (Gate 5 already
    // confirmed the WA 24h window is open this turn, so the send is deliverable.)
    await degradeGracefully({
      admin,
      input,
      bot: bot as BotRow,
      reason: "generate_threw",
      content: botHandoffCopy(bot as BotRow),
      // Distinct flag per failure class so a prior transient ack (e.g. budget)
      // can't suppress this hard-failure escalation. Hard failure → hand to a
      // human (clearBotOnly) so the customer isn't stuck on a failing bot.
      flag: "ack_generate",
      escalate: true,
      clearBotOnly: true,
      canSendToCustomer: true,
    });
    return { skipped: true, reason: "generate_threw" };
  }

  if (result.shouldHandoff && result.handoffReason === "knowledge_gap") {
    await logOutcome(bot.id, input.conversationId, input.contactId, "fallback_no_knowledge", {
      query: queryText,
      max_similarity: result.maxSimilarity,
    });
  }

  // Charge the exact tokens billed (summed across any tool-use rounds). Even
  // if this overshoots the cap slightly on a race (two concurrent inbounds
  // both passing the pre-flight), we'd rather charge an honest amount than
  // refuse mid-call.
  await consumeAiTokens(
    input.channel.org_id,
    result.usage.input_tokens +
      result.usage.output_tokens +
      // Cached prompt tokens are real consumed tokens — charge them (raw volume,
      // not Anthropic's dollar multipliers) or the budget structurally
      // undercounts every cache-hit reply.
      result.usage.cache_read_input_tokens +
      result.usage.cache_creation_input_tokens +
      result.embeddingTokens,
  );

  // Log structured tool outcomes (e.g. capture_lead → 'lead_captured'). The
  // dispatcher only returns outcome types that are valid in the bot_outcomes
  // CHECK; handoff is logged separately by the handoff block below.
  for (const o of result.toolOutcomes) {
    await logOutcome(bot.id, input.conversationId, input.contactId, o.type, o.payload);
    const evt = OUTCOME_EVENT[o.type];
    if (evt) {
      void emit({
        type: evt,
        orgId: input.channel.org_id,
        data: {
          bot_id: bot.id,
          conversation_id: input.conversationId,
          contact_id: input.contactId,
          ...o.payload,
        },
      });
    }
  }

  await sendOutbound(input.channel.type, {
    conversationId: input.conversationId,
    content: result.response,
    botMetadata: {
      bot_id: bot.id,
      model: result.model,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      cache_read_input_tokens: result.usage.cache_read_input_tokens,
      cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      sources_used: result.sourcesUsed,
      max_similarity: result.maxSimilarity,
      tools_invoked: result.toolsInvoked,
      latency_ms: Date.now() - genStart,
    },
    channelId: input.channel.id,
    contactId: input.contactId,
  });

  if (result.shouldHandoff) {
    // If the model's reply was normal prose that didn't itself promise a human
    // (keyword/tool trigger), voice the handoff so the customer isn't left
    // thinking they were ignored. handoffAcknowledged is true when result.response
    // already IS the escalation copy (knowledge-gap / legacy token) — skip then
    // to avoid double-messaging.
    if (!result.handoffAcknowledged) {
      const handoffMsg = pickHandoffMessage((bot as BotRow).behavior_rules);
      await sendOutbound(input.channel.type, {
        conversationId: input.conversationId,
        content: handoffMsg,
        botMetadata: { bot_id: bot.id, handoff_ack: true },
        channelId: input.channel.id,
        contactId: input.contactId,
      });
    }
    // Hand off to a human: open the conversation AND drop bot_only. Without
    // clearing bot_only the bot would just re-acquire the chat on the next
    // inbound (Gate 2 + the assigned check are bypassed in bot_only), so the
    // "let me get a human" promise would be inert and the composer would stay
    // hidden. Clearing it restores the agent composer and the normal guards.
    await admin
      .from("conversations")
      .update({ status: "open", bot_only: false })
      .eq("id", input.conversationId);
    await logOutcome(bot.id, input.conversationId, input.contactId, "handoff", {
      reason: result.handoffReason,
      max_similarity: result.maxSimilarity,
    });
    // Connectors (Make/Zapier/n8n) subscribe to bot.handoff — the live gate
    // must emit it, not just the manual API route.
    void emit({
      type: "bot.handoff",
      orgId: input.channel.org_id,
      data: {
        bot_id: bot.id,
        conversation_id: input.conversationId,
        contact_id: input.contactId,
        reason: result.handoffReason,
      },
    });
  } else {
    // Mark the conversation as bot-active so the inbox filter "Bot" picks it up.
    await admin
      .from("conversations")
      .update({ status: "bot" })
      .eq("id", input.conversationId)
      .eq("status", "open");
  }

  return { skipped: false, sent: true, handoff: result.shouldHandoff };
}

// =====================================================================
// Helpers
// =====================================================================

async function logOutcome(
  botId: string,
  conversationId: string,
  contactId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  try {
    await admin.from("bot_outcomes").insert({
      bot_id: botId,
      conversation_id: conversationId,
      contact_id: contactId,
      type,
      payload,
    });
  } catch (err) {
    console.warn("[bot-gate] logOutcome failed", err);
  }
}

// =====================================================================
// Graceful degradation. The worst outcome for a bot-centric product is to
// greet a customer (or have replied fluently yesterday) and then go SILENT
// when generation can't run — an outage, exhausted budget, missing key, or
// unreadable media. Instead we send ONE human acknowledgement per conversation
// and, for hard failures, flag the chat for a human. Best-effort: never throws.
// =====================================================================
const DEFAULT_OFF_HOURS_MESSAGE =
  "Thanks for reaching out! We're currently closed, but we've received your message and will reply during business hours.";
const DEFAULT_MEDIA_UNREADABLE_MESSAGE =
  "Thanks! I can see you sent an attachment, but I couldn't open it on my end — could you describe it in a message or send it again?";

function botHandoffCopy(bot: BotRow): string {
  // Random-pick across handoff variants if configured; else the service-error
  // default (this path covers outages/budget, not a normal handoff).
  return pickHandoffMessage(
    bot.behavior_rules,
    "Thanks for your message! I'm having trouble responding automatically right now — a team member will get back to you shortly.",
  );
}

// True if a bot message stamped metadata[flag]='true' already exists on the
// conversation (mirrors the greeting dedup guard). When `sinceMs` is set, only
// counts recent ones so a recurring condition (e.g. off-hours over several
// nights) can re-acknowledge after the window passes.
async function botFlagExists(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  flag: string,
  sinceMs?: number,
): Promise<boolean> {
  let q = admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("sender_type", "bot")
    .filter(`metadata->>${flag}`, "eq", "true");
  if (sinceMs) {
    q = q.gte("created_at", new Date(Date.now() - sinceMs).toISOString());
  }
  const { count } = await q;
  return (count ?? 0) > 0;
}

// Send a one-time graceful acknowledgement and (optionally) escalate to a human.
// `canSendToCustomer` is false on undeliverable channels (WhatsApp outside the
// 24h window) — we still escalate so an agent is alerted even when we can't
// message the customer. `clearBotOnly` permanently hands a bot_only funnel to a
// human (hard failures only; transient budget/quota keeps bot_only so the bot
// resumes when the condition clears).
async function degradeGracefully(opts: {
  admin: ReturnType<typeof createAdminClient>;
  input: BotGateInput;
  bot: BotRow;
  reason: string;
  content: string;
  flag: string;
  escalate: boolean;
  clearBotOnly: boolean;
  canSendToCustomer: boolean;
  dedupeSinceMs?: number;
}): Promise<void> {
  const { admin, input, bot } = opts;
  try {
    // Once we've acknowledged this condition on this conversation, don't repeat
    // the ack OR re-escalate on subsequent inbounds — otherwise a persistent
    // condition (e.g. exhausted budget across many messages) would spam the
    // customer and flood handoff emits. (The bot gate only runs on a fresh
    // inbound, so the WA 24h window is effectively always open here; canSend is
    // the guard for the rare stale case.)
    if (await botFlagExists(admin, input.conversationId, opts.flag, opts.dedupeSinceMs)) {
      return;
    }
    if (opts.canSendToCustomer) {
      await sendOutbound(input.channel.type, {
        conversationId: input.conversationId,
        content: opts.content,
        botMetadata: { [opts.flag]: true, degraded_reason: opts.reason, bot_id: bot.id },
        channelId: input.channel.id,
        contactId: input.contactId,
      });
    }
    if (opts.escalate) {
      await admin
        .from("conversations")
        .update(
          opts.clearBotOnly
            ? { status: "open", bot_only: false }
            : { status: "open" },
        )
        .eq("id", input.conversationId);
      await logOutcome(bot.id, input.conversationId, input.contactId, "handoff", {
        reason: opts.reason,
      });
      void emit({
        type: "bot.handoff",
        orgId: input.channel.org_id,
        data: {
          bot_id: bot.id,
          conversation_id: input.conversationId,
          contact_id: input.contactId,
          reason: opts.reason,
        },
      });
    }
  } catch (err) {
    console.error("[bot-gate] degradeGracefully failed", { reason: opts.reason, err });
  }
}

// =====================================================================
// Business-hours evaluation. business_hours JSONB shape:
// { active: true, timezone: 'Europe/Madrid',
//   mon: [{ start: '09:00', end: '18:00' }], tue: [...], ..., sun: [] }
// Empty array for a day = closed. Multiple windows allowed for split shifts.
// =====================================================================
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function isWithinHours(
  hours: Record<string, unknown>,
  timezone: string,
  now: Date,
): boolean {
  // Get local hour/minute/day in the bot's TZ using Intl rather than a
  // dep. This handles DST correctly because Intl uses the IANA tzdb.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const weekdayShort = (parts.weekday ?? "").toLowerCase().slice(0, 3) as
    | (typeof DAY_KEYS)[number]
    | "";
  const dayKey = (DAY_KEYS as readonly string[]).includes(weekdayShort)
    ? (weekdayShort as (typeof DAY_KEYS)[number])
    : null;
  if (!dayKey) return false;

  const windows = hours[dayKey];
  if (!Array.isArray(windows) || windows.length === 0) return false;

  const hh = Number(parts.hour ?? "0");
  const mm = Number(parts.minute ?? "0");
  const minutes = hh * 60 + mm;
  for (const w of windows as Array<{ start: string; end: string }>) {
    const [s1, s2] = w.start.split(":").map(Number);
    const [e1, e2] = w.end.split(":").map(Number);
    const startM = s1 * 60 + (s2 ?? 0);
    const endM = e1 * 60 + (e2 ?? 0);
    if (minutes >= startM && minutes <= endM) return true;
  }
  return false;
}

// =====================================================================
// Outbound dispatch — calls the appropriate /api/channels/{provider}/send
// from server-side. We call our own send endpoint (instead of duplicating
// provider logic) so the bot reply goes through the exact same code path
// as an agent's send: same retry policy, same token unwrap, same message
// row format.
// =====================================================================
export async function sendOutbound(
  channelType: string,
  args: {
    conversationId: string;
    content: string;
    botMetadata: Record<string, unknown>;
    channelId: string;
    contactId: string;
    // Outbound rows default to sender_type 'bot'; a support customer-reply
    // passes 'agent' so it pauses the bot + isn't treated as a bot reply.
    senderType?: "agent" | "bot";
  },
): Promise<void> {
  const admin = createAdminClient();

  // For bot outbound we write to messages directly here instead of going
  // through the API endpoint — the API endpoint requires an authenticated
  // agent session, which we don't have in a webhook context. We DO call
  // the provider API directly via the existing per-provider send helpers.
  // For MVP simplicity we re-issue the provider call inline; refactor to
  // a shared helper later if we add more channel types.

  if (channelType === "telegram") {
    await sendTelegram(admin, args);
  } else if (channelType === "whatsapp") {
    await sendWhatsApp(admin, args);
  } else if (channelType === "instagram") {
    await sendInstagram(admin, args);
  } else if (channelType === "facebook") {
    await sendMessenger(admin, args);
  } else if (channelType === "webchat") {
    await sendWebchat(admin, args);
  } else if (channelType === "email") {
    await sendEmail(admin, args);
  }
}

// Email bot reply via Resend. Threads onto the most recent inbound email on
// the conversation (In-Reply-To / References + a fresh Message-Id stored on
// email_message_id) so the customer's client groups it. Plain-text body.
async function sendEmail(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    conversationId: string;
    content: string;
    botMetadata: Record<string, unknown>;
    channelId: string;
    contactId: string;
    // Outbound rows default to sender_type 'bot'; a support customer-reply
    // passes 'agent' so it pauses the bot + isn't treated as a bot reply.
    senderType?: "agent" | "bot";
  },
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[bot-gate] sendEmail: RESEND_API_KEY not set — skipping");
    return;
  }
  const [{ data: channel }, { data: contact }, { data: lastInbound }] = await Promise.all([
    admin
      .from("channels")
      .select("inbox_email, metadata, name")
      .eq("id", args.channelId)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("email")
      .eq("id", args.contactId)
      .maybeSingle(),
    admin
      .from("messages")
      .select("email_message_id, metadata")
      .eq("conversation_id", args.conversationId)
      .eq("direction", "inbound")
      .not("email_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!contact?.email) return;

  const metadata = (channel?.metadata ?? {}) as { from_name?: string };
  const fromName = metadata.from_name ?? channel?.name ?? "Xyra Chat";
  const fromAddress =
    channel?.inbox_email ?? process.env.EMAIL_FROM_ADDRESS ?? "support@xyrachat.com";

  // Threading off the inbound we're answering.
  const priorEmail = (lastInbound?.metadata as { email?: { subject?: string; references?: string[] } } | null)?.email;
  const inReplyTo = lastInbound?.email_message_id ?? undefined;
  const references = inReplyTo
    ? [...(priorEmail?.references ?? []), inReplyTo]
    : undefined;
  let subject = priorEmail?.subject ?? channel?.name ?? "Re:";
  if (!/^re:/i.test(subject)) subject = `Re: ${subject}`;

  const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN ?? "mail.xyrachat.com";
  const outboundMessageId = `<${crypto.randomUUID()}@${inboundDomain}>`;

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const sendRes = await resend.emails.send({
    from: `${fromName} <${fromAddress}>`,
    to: contact.email,
    subject,
    text: args.content,
    headers: {
      "Message-ID": outboundMessageId,
      ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
      ...(references && references.length ? { References: references.join(" ") } : {}),
    },
  });
  if (sendRes.error) {
    console.error("[bot-gate] sendEmail failed", sendRes.error);
    return;
  }

  await admin.from("messages").insert({
    conversation_id: args.conversationId,
    direction: "outbound",
    content: args.content,
    sender_type: args.senderType ?? "bot",
    status: "sent",
    email_message_id: outboundMessageId,
    metadata: {
      ...args.botMetadata,
      email: {
        subject,
        from_address: fromAddress,
        from_name: fromName,
        to_addresses: [contact.email],
        message_id: outboundMessageId,
        in_reply_to: inReplyTo,
        references,
      },
      resend_id: sendRes.data?.id ?? null,
    },
  });
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", args.conversationId);
}

// Webchat has no provider — the bot reply is just an outbound row the visitor's
// widget polls for.
async function sendWebchat(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    conversationId: string;
    content: string;
    botMetadata: Record<string, unknown>;
    channelId: string;
    contactId: string;
    // Outbound rows default to sender_type 'bot'; a support customer-reply
    // passes 'agent' so it pauses the bot + isn't treated as a bot reply.
    senderType?: "agent" | "bot";
  },
): Promise<void> {
  await admin.from("messages").insert({
    conversation_id: args.conversationId,
    direction: "outbound",
    content: args.content,
    sender_type: args.senderType ?? "bot",
    status: "sent",
    metadata: args.botMetadata,
  });
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", args.conversationId);
}

import { vaultReadSecret } from "@/lib/supabase/vault";

const META_GRAPH_VERSION = "v22.0";
const IG_GRAPH_VERSION = "v22.0";

async function sendTelegram(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    conversationId: string;
    content: string;
    botMetadata: Record<string, unknown>;
    channelId: string;
    contactId: string;
    // Outbound rows default to sender_type 'bot'; a support customer-reply
    // passes 'agent' so it pauses the bot + isn't treated as a bot reply.
    senderType?: "agent" | "bot";
  },
): Promise<void> {
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("access_token_vault_id")
      .eq("id", args.channelId)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("telegram_id")
      .eq("id", args.contactId)
      .maybeSingle(),
  ]);
  if (!channel?.access_token_vault_id || !contact?.telegram_id) return;
  const token = await vaultReadSecret(channel.access_token_vault_id).catch(() => null);
  if (!token) return;
  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: contact.telegram_id, text: args.content }),
  });
  const tgJson = (await tgRes.json().catch(() => null)) as
    | { ok: boolean; result?: { message_id: number; chat: { id: number } } }
    | null;
  const tgKey = tgJson?.result
    ? `${tgJson.result.chat.id}:${tgJson.result.message_id}`
    : null;
  await admin.from("messages").insert({
    conversation_id: args.conversationId,
    direction: "outbound",
    content: args.content,
    sender_type: args.senderType ?? "bot",
    status: "sent",
    telegram_message_id: tgKey,
    metadata: args.botMetadata,
  });
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", args.conversationId);
}

async function sendWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    conversationId: string;
    content: string;
    botMetadata: Record<string, unknown>;
    channelId: string;
    contactId: string;
    // Outbound rows default to sender_type 'bot'; a support customer-reply
    // passes 'agent' so it pauses the bot + isn't treated as a bot reply.
    senderType?: "agent" | "bot";
  },
): Promise<void> {
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("phone_number_id, access_token_vault_id")
      .eq("id", args.channelId)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("phone")
      .eq("id", args.contactId)
      .maybeSingle(),
  ]);
  if (
    !channel?.phone_number_id ||
    !channel.access_token_vault_id ||
    !contact?.phone
  )
    return;
  const token = await vaultReadSecret(channel.access_token_vault_id).catch(() => null);
  if (!token) return;
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.phone_number_id}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: contact.phone,
      type: "text",
      text: { body: args.content },
    }),
  });
  const json = (await res.json().catch(() => null)) as
    | { messages?: Array<{ id: string }> }
    | null;
  const waId = json?.messages?.[0]?.id ?? null;
  await admin.from("messages").insert({
    conversation_id: args.conversationId,
    direction: "outbound",
    content: args.content,
    sender_type: args.senderType ?? "bot",
    status: "sent",
    wa_message_id: waId,
    metadata: args.botMetadata,
  });
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", args.conversationId);
}

async function sendInstagram(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    conversationId: string;
    content: string;
    botMetadata: Record<string, unknown>;
    channelId: string;
    contactId: string;
    // Outbound rows default to sender_type 'bot'; a support customer-reply
    // passes 'agent' so it pauses the bot + isn't treated as a bot reply.
    senderType?: "agent" | "bot";
  },
): Promise<void> {
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("page_id, ig_business_account_id, access_token_vault_id, metadata")
      .eq("id", args.channelId)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("instagram_id")
      .eq("id", args.contactId)
      .maybeSingle(),
  ]);
  if (!channel?.access_token_vault_id || !contact?.instagram_id) return;
  const token = await vaultReadSecret(channel.access_token_vault_id).catch(() => null);
  if (!token) return;
  const useIgDirect = !channel.page_id && Boolean(channel.ig_business_account_id);
  const igLoginUserId =
    (channel.metadata as { ig_login_user_id?: string } | null)?.ig_login_user_id ??
    channel.ig_business_account_id;
  const url = useIgDirect
    ? `https://graph.instagram.com/${IG_GRAPH_VERSION}/${igLoginUserId}/messages`
    : `https://graph.facebook.com/${IG_GRAPH_VERSION}/${channel.page_id}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: contact.instagram_id },
      messaging_type: "RESPONSE",
      message: { text: args.content },
    }),
  });
  const json = (await res.json().catch(() => null)) as
    | { message_id?: string }
    | null;
  await admin.from("messages").insert({
    conversation_id: args.conversationId,
    direction: "outbound",
    content: args.content,
    sender_type: args.senderType ?? "bot",
    status: "sent",
    ig_message_id: json?.message_id ?? null,
    metadata: args.botMetadata,
  });
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", args.conversationId);
}

async function sendMessenger(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    conversationId: string;
    content: string;
    botMetadata: Record<string, unknown>;
    channelId: string;
    contactId: string;
    // Outbound rows default to sender_type 'bot'; a support customer-reply
    // passes 'agent' so it pauses the bot + isn't treated as a bot reply.
    senderType?: "agent" | "bot";
  },
): Promise<void> {
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("page_id, access_token_vault_id")
      .eq("id", args.channelId)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("messenger_id")
      .eq("id", args.contactId)
      .maybeSingle(),
  ]);
  if (!channel?.page_id || !channel.access_token_vault_id || !contact?.messenger_id) return;
  const token = await vaultReadSecret(channel.access_token_vault_id).catch(() => null);
  if (!token) return;
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.page_id}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: contact.messenger_id },
      messaging_type: "RESPONSE",
      message: { text: args.content },
    }),
  });
  const json = (await res.json().catch(() => null)) as
    | { message_id?: string }
    | null;
  await admin.from("messages").insert({
    conversation_id: args.conversationId,
    direction: "outbound",
    content: args.content,
    sender_type: args.senderType ?? "bot",
    status: "sent",
    messenger_message_id: json?.message_id ?? null,
    metadata: args.botMetadata,
  });
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", args.conversationId);
}
