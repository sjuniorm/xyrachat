"use server";

import { requireOperator } from "@/lib/admin/operator";
import { getActiveSupportGrant } from "@/lib/support/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOutbound, type ProviderChannel } from "@/lib/ai/bot-gate";
import { revalidatePath } from "next/cache";

// =====================================================================
// Support WRITE path — bounded by construction (NOT membership impersonation).
// A single dedicated server action that lets Xyra Support post an INTERNAL NOTE
// into a consented client conversation. Gated on:
//   (a) caller is the operator (owner of XYRA_OPERATOR_ORG_ID),
//   (b) the client has an ACTIVE support grant,
//   (c) that grant's scope is read_reply (view-only grants can't write),
//   (d) the conversation belongs to the granted org (tenant guard).
// Every note is audited. The note is is_internal_note=true → it is visible to
// the client's own agents but is NEVER sent to the customer (no provider call).
//
// Customer-facing "reply as the business to the customer" is DELIBERATELY NOT
// here — sending to a client's customers as the business needs its own design
// (channel windows, attribution, the reputational call) + review. The grant
// scope (read_reply) is the gate it would sit behind. See
// _docs/support-access-design.md.
// =====================================================================
export async function postSupportNote(
  orgId: string,
  conversationId: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };

  const grant = await getActiveSupportGrant(orgId);
  if (!grant) return { ok: false, error: "No active support grant for this workspace." };
  if (grant.scope !== "read_reply") {
    return { ok: false, error: "This workspace granted view-only support access — notes aren't permitted." };
  }

  const text = content.trim();
  if (!text) return { ok: false, error: "The note is empty." };
  if (text.length > 5000) return { ok: false, error: "The note is too long (max 5000 characters)." };

  const admin = createAdminClient();
  // Tenant guard: the conversation MUST belong to the granted org.
  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!conv) return { ok: false, error: "Conversation not found in this workspace." };

  const { error } = await admin.from("messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    content: text,
    sender_type: "agent",
    sender_id: null, // operator isn't a member of this org — attribute via metadata
    status: "sent",
    is_internal_note: true, // NEVER customer-facing
    metadata: { support: true, support_author: "Xyra Support", support_operator: op.userId },
  });
  if (error) return { ok: false, error: "Could not post the note." };

  // Audit the write (best-effort — don't fail the note on a log hiccup).
  try {
    await admin.from("support_access_log").insert({
      org_id: orgId,
      support_user: op.userId,
      actor: op.userId,
      action: "action",
      detail: { type: "internal_note", conversation_id: conversationId },
    });
  } catch {
    /* best-effort */
  }

  revalidatePath(`/settings/admin/clients/${orgId}/c/${conversationId}`);
  return { ok: true };
}

// =====================================================================
// Customer-facing support reply — sends a message AS THE BUSINESS to the
// client's customer over the conversation's channel. Same bounded gating as the
// internal note (operator + active grant + read_reply scope + tenant guard +
// audit). Stored sender_type='agent' (so it pauses the bot like a human reply
// and isn't shown as a bot reply) + metadata.support so the inbox can attribute
// it to "Xyra Support". WhatsApp is guarded by the 24h customer-service window.
//
// NOTE: send is fire-and-forget at the provider layer (same as bot/agent sends)
// — the message lands in the thread; we don't get a hard provider delivery
// receipt synchronously. The WA-window pre-check catches the common rejection.
// =====================================================================
export async function supportReplyToCustomer(
  orgId: string,
  conversationId: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };

  const grant = await getActiveSupportGrant(orgId);
  if (!grant) return { ok: false, error: "No active support grant for this workspace." };
  if (grant.scope !== "read_reply") {
    return { ok: false, error: "This workspace granted view-only support access." };
  }

  const text = content.trim();
  if (!text) return { ok: false, error: "The reply is empty." };
  if (text.length > 4000) return { ok: false, error: "The reply is too long (max 4000 characters)." };

  const admin = createAdminClient();
  // Tenant guard + resolve the channel (its type drives the provider) + the
  // last inbound time (WA window). The conversation MUST belong to the org.
  const { data: convRaw } = await admin
    .from("conversations")
    .select(
      "id, channel_id, contact_id, last_inbound_at, channel:channels!conversations_channel_id_fkey(type, org_id)",
    )
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  // The FK join is typed as an array by the client; coerce to the to-one shape
  // (same pattern as lib/inbox & lib/support/view).
  const conv = convRaw as unknown as {
    channel_id: string | null;
    contact_id: string | null;
    last_inbound_at: string | null;
    channel: { type: string; org_id: string } | null;
  } | null;
  if (!conv || !conv.channel_id || !conv.contact_id) {
    return { ok: false, error: "Conversation not found in this workspace." };
  }
  const channel = conv.channel;
  if (!channel || channel.org_id !== orgId) {
    return { ok: false, error: "Channel does not belong to this workspace." };
  }

  // WhatsApp: free-form replies only inside the 24h customer-service window.
  if (channel.type === "whatsapp") {
    const last = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
    if (Date.now() - last >= 24 * 60 * 60 * 1000) {
      return {
        ok: false,
        error: "WhatsApp's 24-hour window has closed — the customer must message again first (or the client must send an approved template).",
      };
    }
  }

  try {
    await sendOutbound(channel.type as ProviderChannel, {
      conversationId,
      content: text,
      channelId: conv.channel_id,
      contactId: conv.contact_id,
      senderType: "agent",
      botMetadata: { support: true, support_author: "Xyra Support", support_operator: op.userId },
    });
  } catch (err) {
    console.error("[support] customer reply send failed", err);
    return { ok: false, error: "Could not send the reply over the channel." };
  }

  try {
    await admin.from("support_access_log").insert({
      org_id: orgId,
      support_user: op.userId,
      actor: op.userId,
      action: "action",
      detail: { type: "customer_reply", conversation_id: conversationId, channel: channel.type },
    });
  } catch {
    /* best-effort */
  }

  revalidatePath(`/settings/admin/clients/${orgId}/c/${conversationId}`);
  return { ok: true };
}
