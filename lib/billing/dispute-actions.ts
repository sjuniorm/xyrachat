"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitDisputeEvidence } from "./dispute-evidence";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireOperator(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.role !== "owner") {
    return { ok: false, error: "Operator access is owner-only." };
  }
  const operatorOrg = process.env.XYRA_OPERATOR_ORG_ID;
  if (operatorOrg && profile.org_id !== operatorOrg) {
    return { ok: false, error: "Not the Xyra operator org." };
  }
  return { ok: true };
}

// Force-submit the auto-assembled evidence now (e.g. after editing notes,
// or if the auto-submit on creation failed).
export async function forceSubmitEvidence(stripeDisputeId: string): Promise<ActionResult> {
  const op = await requireOperator();
  if (!op.ok) return op;
  const res = await submitDisputeEvidence(stripeDisputeId);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/settings/admin/disputes");
  return { ok: true };
}

export async function saveDisputeNote(
  disputeRowId: string,
  note: string,
): Promise<ActionResult> {
  const op = await requireOperator();
  if (!op.ok) return op;
  const admin = createAdminClient();
  const { error } = await admin
    .from("disputes")
    .update({ admin_notes: note })
    .eq("id", disputeRowId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/admin/disputes");
  return { ok: true };
}
