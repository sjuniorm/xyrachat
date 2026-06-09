import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// The webchat widget runs on the customer's own website (any origin) and talks
// to these public endpoints, gated by the channel's PUBLIC key + a visitor
// token — not by a session. CORS is open because the public key scopes every
// call to one channel and a visitor only ever sees their own conversation.
export const WEBCHAT_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export type WebchatChannel = {
  id: string;
  org_id: string;
  active: boolean;
  metadata: Record<string, unknown> | null;
};

// A public key looks like `xyra_wc_<hex>`; reject anything else cheaply before
// hitting the DB.
export function isWebchatKey(k: string | null | undefined): k is string {
  return typeof k === "string" && /^xyra_wc_[a-f0-9]{24,}$/.test(k);
}

export async function resolveWebchatChannel(
  publicKey: string,
): Promise<WebchatChannel | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("channels")
    .select("id, org_id, active, metadata")
    .eq("type", "webchat")
    .eq("webchat_public_key", publicKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data || !data.active) return null;
  return data as WebchatChannel;
}

// Find or create the anonymous visitor's contact (scoped to the channel's org)
// + their open conversation on this channel. Visitor id is the localStorage
// token the widget generates.
export async function resolveVisitor(
  channel: WebchatChannel,
  visitorId: string,
  visitorName?: string | null,
): Promise<{ contactId: string; conversationId: string } | null> {
  const admin = createAdminClient();
  const cleanName = visitorName?.trim().slice(0, 80) || null;

  const existingContact = await admin
    .from("contacts")
    .select("id, name")
    .eq("org_id", channel.org_id)
    .eq("webchat_id", visitorId)
    .is("deleted_at", null)
    .maybeSingle();

  let contactId = existingContact.data?.id ?? null;
  if (!contactId) {
    const { data } = await admin
      .from("contacts")
      .insert({
        org_id: channel.org_id,
        webchat_id: visitorId,
        name: cleanName || "Website visitor",
      })
      .select("id")
      .single();
    contactId = data?.id ?? null;
  } else if (cleanName && (!existingContact.data?.name || existingContact.data.name === "Website visitor")) {
    await admin.from("contacts").update({ name: cleanName }).eq("id", contactId);
  }
  if (!contactId) return null;

  const existingConv = await admin
    .from("conversations")
    .select("id, status")
    .eq("channel_id", channel.id)
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId = existingConv.data?.id ?? null;
  if (conversationId) {
    if (existingConv.data?.status === "closed" || existingConv.data?.status === "snoozed") {
      await admin
        .from("conversations")
        .update({ status: "open", snooze_until: null })
        .eq("id", conversationId);
    }
  } else {
    const { data } = await admin
      .from("conversations")
      .insert({ org_id: channel.org_id, channel_id: channel.id, contact_id: contactId })
      .select("id")
      .single();
    conversationId = data?.id ?? null;
  }
  if (!conversationId) return null;

  return { contactId, conversationId };
}
