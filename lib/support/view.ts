import "server-only";
import { requireOperator } from "@/lib/admin/operator";
import { getActiveSupportGrant } from "@/lib/support/access";
import { createAdminClient } from "@/lib/supabase/admin";

// =====================================================================
// Read-only "support view" — Xyra Support inspects a client's inbox to help,
// ONLY when (a) the caller is the operator (owner of XYRA_OPERATOR_ORG_ID) AND
// (b) the client has an ACTIVE support grant. Service-role reads, every access
// audited to support_access_log. NO writes — support never becomes a member,
// never switches org, never touches a write path. See _docs/support-access-design.md.
// =====================================================================

type Gate = { ok: true; operatorUserId: string } | { ok: false; error: string };

async function supportGate(orgId: string): Promise<Gate> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };
  const grant = await getActiveSupportGrant(orgId);
  if (!grant) return { ok: false, error: "No active support grant for this workspace." };
  return { ok: true, operatorUserId: op.userId };
}

async function audit(orgId: string, userId: string, action: "entered" | "action", detail: Record<string, unknown>) {
  try {
    await createAdminClient()
      .from("support_access_log")
      .insert({ org_id: orgId, support_user: userId, actor: userId, action, detail });
  } catch {
    /* audit is best-effort — never block the read on a log failure */
  }
}

export type SupportConversation = {
  id: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  contact_name: string | null;
  channel_type: string | null;
};

export async function getClientConversations(
  orgId: string,
): Promise<{ ok: true; conversations: SupportConversation[] } | { ok: false; error: string }> {
  const gate = await supportGate(orgId);
  if (!gate.ok) return gate;

  const admin = createAdminClient();
  const { data } = await admin
    .from("conversations")
    .select(
      "id, status, last_message_at, last_message_preview, contact:contacts!conversations_contact_id_fkey(name), channel:channels!conversations_channel_id_fkey(type)",
    )
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(50);

  await audit(orgId, gate.operatorUserId, "entered", { view: "conversations" });

  const conversations: SupportConversation[] = (
    (data as Array<{
      id: string;
      status: string;
      last_message_at: string | null;
      last_message_preview: string | null;
      contact: { name: string | null } | null;
      channel: { type: string | null } | null;
    }> | null) ?? []
  ).map((c) => ({
    id: c.id,
    status: c.status,
    last_message_at: c.last_message_at,
    last_message_preview: c.last_message_preview,
    contact_name: c.contact?.name ?? null,
    channel_type: c.channel?.type ?? null,
  }));
  return { ok: true, conversations };
}

export type SupportMessage = {
  id: string;
  content: string | null;
  direction: string;
  sender_type: string | null;
  is_internal_note: boolean;
  created_at: string;
};

export async function getClientConversationMessages(
  orgId: string,
  conversationId: string,
): Promise<
  | { ok: true; contactName: string | null; channelType: string | null; messages: SupportMessage[] }
  | { ok: false; error: string }
> {
  const gate = await supportGate(orgId);
  if (!gate.ok) return gate;

  const admin = createAdminClient();
  // The conversation MUST belong to the granted org (tenant guard).
  const { data: conv } = await admin
    .from("conversations")
    .select("id, contact:contacts!conversations_contact_id_fkey(name), channel:channels!conversations_channel_id_fkey(type)")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!conv) return { ok: false, error: "Conversation not found." };

  const { data: msgs } = await admin
    .from("messages")
    .select("id, content, direction, sender_type, is_internal_note, created_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(300);

  await audit(orgId, gate.operatorUserId, "action", { viewed_conversation: conversationId });

  const c = conv as unknown as { contact: { name: string | null } | null; channel: { type: string | null } | null };
  return {
    ok: true,
    contactName: c.contact?.name ?? null,
    channelType: c.channel?.type ?? null,
    messages: ((msgs as SupportMessage[] | null) ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      direction: m.direction,
      sender_type: m.sender_type,
      is_internal_note: m.is_internal_note ?? false,
      created_at: m.created_at,
    })),
  };
}
