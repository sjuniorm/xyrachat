import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeAutomation } from "./executor";
import { matchesKeywords, type AutomationRow, type TriggerType } from "./types";
import { isWithinBusinessHours } from "@/lib/bots/business-hours";

// Entry point called by webhook handlers when a relevant event happens.
// Loads matching active automations for the channel + trigger_type,
// filters by trigger_config (keywords, post_id), enforces one-shot
// semantics for follower/conversation_opened triggers, and fires them
// via the executor. Fire-and-forget so the webhook can return 200
// within Meta's 5s deadline.
export async function dispatchTrigger(input: {
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
  contactId: string;
  triggerType: TriggerType;
  // Text the trigger evaluator should match keywords against (DM body,
  // comment text, WA message). Optional for triggers that don't gate
  // on text (follower, story_mention, conversation_opened).
  matchText?: string | null;
  // Extra trigger context — passed to the executor for {{var}} merging
  // and to dedupe one-shot triggers.
  triggerData?: Record<string, unknown>;
  // For ig_comment_keyword we also filter by post_id when set.
  postId?: string | null;
  conversationId?: string | null;
}): Promise<void> {
  const admin = createAdminClient();

  const { data: automations } = await admin
    .from("automations")
    .select("*")
    .eq("channel_id", input.channel.id)
    .eq("trigger_type", input.triggerType)
    .eq("active", true)
    .is("deleted_at", null);
  if (!automations || automations.length === 0) return;

  const { data: contact } = await admin
    .from("contacts")
    .select("id, org_id, name, phone, email, instagram_id, telegram_id, messenger_id")
    .eq("id", input.contactId)
    .maybeSingle();
  if (!contact) return;

  for (const raw of automations) {
    const automation = raw as AutomationRow;

    // Trigger-config filters.
    if (
      input.triggerType === "ig_comment_keyword" ||
      input.triggerType === "ig_dm_keyword" ||
      input.triggerType === "wa_keyword" ||
      input.triggerType === "tg_keyword" ||
      input.triggerType === "email_keyword"
    ) {
      if (!matchesKeywords(input.matchText ?? null, automation.trigger_config ?? {})) {
        continue;
      }
    }
    if (input.triggerType === "ig_comment_keyword") {
      const required = automation.trigger_config?.post_id;
      if (required && required !== input.postId) continue;
    }

    // Active-hours gate: when the automation restricts to set hours and we're
    // outside them, skip — but do this BEFORE the one-shot dedupe so an
    // off-hours event doesn't consume the contact's only fire (they can still
    // trigger it once we're open again).
    const bh = automation.trigger_config?.business_hours;
    if (bh && bh.active && !isWithinBusinessHours(bh)) continue;

    // One-shot dedupe for triggers that should fire once per contact.
    if (
      input.triggerType === "ig_new_follower" ||
      input.triggerType === "conversation_opened"
    ) {
      const { error: dedupeErr } = await admin
        .from("automation_fires")
        .insert({ automation_id: automation.id, contact_id: contact.id });
      // Duplicate-key error => already fired for this contact; skip silently.
      if (dedupeErr) continue;
    }

    // Fire-and-forget so a slow Meta/Telegram round-trip in the executor
    // doesn't pin the webhook's response. Merge the trigger's message text into
    // triggerData as `message_text` so if/else conditions + {{message_text}}
    // can use it (and it survives across a scheduled resume).
    void executeAutomation({
      automation,
      contact,
      channel: input.channel,
      conversationId: input.conversationId ?? null,
      triggerData: {
        ...(input.triggerData ?? {}),
        ...(input.matchText ? { message_text: input.matchText } : {}),
      },
    }).catch((err) => {
      console.error("[automation] executor crashed", { id: automation.id, err });
    });
  }
}
