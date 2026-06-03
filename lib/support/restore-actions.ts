"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperator } from "@/lib/admin/operator";

type ActionResult = { ok: true } | { ok: false; error: string };

const PATH = "/settings/admin/restore";

// Reactivate a soft-deleted workspace via the restore_org RPC (migration 033),
// the surgical inverse of soft_delete_org.
export async function restoreOrg(orgId: string): Promise<ActionResult> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };
  if (!orgId) return { ok: false, error: "Missing workspace id." };

  const admin = createAdminClient();
  const { error } = await admin.rpc("restore_org", { p_org_id: orgId });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH);
  revalidatePath("/settings/admin/entitlements");
  return { ok: true };
}

// Restore a single soft-deleted conversation. Refuses when the owning
// workspace is itself deleted — restoring an orphan would be confusing; the
// operator should restore the whole workspace instead.
export async function restoreConversation(id: string): Promise<ActionResult> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };
  if (!id) return { ok: false, error: "Missing conversation id." };

  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("conversations")
    .select("id, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!conv) return { ok: false, error: "Conversation not found." };

  const { data: org } = await admin
    .from("organizations")
    .select("deleted_at")
    .eq("id", conv.org_id)
    .maybeSingle();
  if (org?.deleted_at) {
    return {
      ok: false,
      error: "This conversation's workspace is deleted — restore the workspace instead.",
    };
  }

  const { error } = await admin
    .from("conversations")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH);
  revalidatePath("/inbox");
  return { ok: true };
}

// Restore a single soft-deleted contact. Same active-workspace guard.
export async function restoreContact(id: string): Promise<ActionResult> {
  const op = await requireOperator();
  if (!op.ok) return { ok: false, error: op.error };
  if (!id) return { ok: false, error: "Missing contact id." };

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!contact) return { ok: false, error: "Contact not found." };

  const { data: org } = await admin
    .from("organizations")
    .select("deleted_at")
    .eq("id", contact.org_id)
    .maybeSingle();
  if (org?.deleted_at) {
    return {
      ok: false,
      error: "This contact's workspace is deleted — restore the workspace instead.",
    };
  }

  const { error } = await admin
    .from("contacts")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH);
  revalidatePath("/contacts");
  return { ok: true };
}
