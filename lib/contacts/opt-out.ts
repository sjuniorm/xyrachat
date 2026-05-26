import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Keywords across the languages we currently serve. Match-on-equal (case-
// insensitive, trimmed) so a long sentence containing "stop" doesn't
// trigger an unsubscribe — only "stop" / "STOP" on its own.
const STOP_KEYWORDS = new Set([
  "stop", "unsubscribe", "quit", "end", "remove", "cancel",
  "baja", "cancelar", "parar",
  "arrêt", "arret", "desabonner",
  "parar", "sair",
  "stopp", "abmelden",
  "stoppen", "afmelden",
]);

const START_KEYWORDS = new Set([
  "start", "yes", "subscribe", "resubscribe",
  "alta", "si",
  "oui",
  "ja",
  "sim",
]);

export type OptOutAction = "opt_out" | "opt_in" | null;

export function classifyOptOut(content: string | null): OptOutAction {
  if (!content) return null;
  const trimmed = content.trim().toLowerCase();
  // Only fire on tight matches — equal or "stop." / "stop!" with terminal
  // punctuation. Prevents "if you stop the car..." from unsubscribing.
  const stripped = trimmed.replace(/[.!?,;:]+$/, "");
  if (STOP_KEYWORDS.has(stripped)) return "opt_out";
  if (START_KEYWORDS.has(stripped)) return "opt_in";
  return null;
}

// Apply opt-out / opt-in and log. Safe to call on every inbound — returns
// null when no action was needed. The auto-confirm message is the caller's
// responsibility (provider-specific).
export async function applyOptOutAction(params: {
  orgId: string;
  contactId: string;
  channelType: string;
  content: string;
}): Promise<{
  action: OptOutAction;
  confirmation: string | null;
}> {
  const action = classifyOptOut(params.content);
  if (!action) return { action: null, confirmation: null };

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("opted_out")
    .eq("id", params.contactId)
    .maybeSingle();
  if (!contact) return { action: null, confirmation: null };

  if (action === "opt_out" && !contact.opted_out) {
    await admin
      .from("contacts")
      .update({
        opted_out: true,
        opted_out_at: new Date().toISOString(),
        opt_out_reason: "keyword",
      })
      .eq("id", params.contactId);
    await admin.from("opt_out_log").insert({
      org_id: params.orgId,
      contact_id: params.contactId,
      channel_type: params.channelType,
      action: "opt_out",
      keyword: params.content.trim().toLowerCase(),
      message_content: params.content,
    });
    return {
      action,
      confirmation:
        "You've been unsubscribed. Reply START anytime to resubscribe.",
    };
  }

  if (action === "opt_in" && contact.opted_out) {
    await admin
      .from("contacts")
      .update({ opted_out: false, opted_out_at: null, opt_out_reason: null })
      .eq("id", params.contactId);
    await admin.from("opt_out_log").insert({
      org_id: params.orgId,
      contact_id: params.contactId,
      channel_type: params.channelType,
      action: "opt_in",
      keyword: params.content.trim().toLowerCase(),
      message_content: params.content,
    });
    return {
      action,
      confirmation: "Welcome back — you'll receive messages again.",
    };
  }

  return { action: null, confirmation: null };
}
