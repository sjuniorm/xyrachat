"use server";

import { requireOperator } from "@/lib/admin/operator";
import { getActiveSupportGrant } from "@/lib/support/access";
import { createAdminClient } from "@/lib/supabase/admin";
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
