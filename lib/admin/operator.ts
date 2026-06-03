import "server-only";
import { createClient } from "@/lib/supabase/server";

// =====================================================================
// Operator gate. "Operator" = an owner of the Xyra Chat operating org,
// identified by the XYRA_OPERATOR_ORG_ID env var. When that var is unset
// (dev / pre-launch single org), ANY owner qualifies so the founder can
// self-serve. Once customer orgs exist, set the env var to lock these
// consoles down to the Xyra team's org.
//
// lib/billing/admin-actions.ts keeps its own copy of this gate (security
// surface reviewed independently). New admin modules should import this.
// =====================================================================
export type OperatorAuth =
  | { ok: true; userId: string; orgId: string }
  | { ok: false; error: string };

export async function requireOperator(): Promise<OperatorAuth> {
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
  if (!profile?.org_id) return { ok: false, error: "Not in an org." };
  if (profile.role !== "owner") {
    return { ok: false, error: "Operator access is owner-only." };
  }
  const operatorOrg = process.env.XYRA_OPERATOR_ORG_ID;
  if (operatorOrg && profile.org_id !== operatorOrg) {
    return { ok: false, error: "Not the Xyra operator org." };
  }
  return { ok: true, userId: user.id, orgId: profile.org_id };
}

// Synchronous predicate for server-component page gates (the caller already
// has the profile in hand and doesn't need another DB round-trip).
export function isOperatorProfile(
  role: string | null | undefined,
  orgId: string | null | undefined,
): boolean {
  if (role !== "owner" || !orgId) return false;
  const operatorOrg = process.env.XYRA_OPERATOR_ORG_ID;
  return !operatorOrg || orgId === operatorOrg;
}
