import "server-only";
import { createClient } from "@/lib/supabase/server";

// =====================================================================
// Operator gate. "Operator" = an owner of the Xyra Chat operating org,
// identified by the XYRA_OPERATOR_ORG_ID env var.
//
// Fail-CLOSED in production: if the env var is unset on a production/preview
// build, NO ONE qualifies (set XYRA_OPERATOR_ORG_ID to your org's UUID to
// unlock the consoles). Only in local development (NODE_ENV !== "production")
// does any owner qualify, for founder self-serve. This prevents a missing env
// var from silently widening these cross-tenant consoles to every customer
// owner once real orgs exist.
//
// lib/billing/admin-actions.ts keeps its own copy of this gate (security
// surface reviewed independently). Keep the two in sync.
// =====================================================================
export type OperatorAuth =
  | { ok: true; userId: string; orgId: string }
  | { ok: false; error: string };

// Single source of truth for "is this org the operator org?". Fail-closed in
// production when unconfigured; any owner allowed only in local dev.
export function operatorOrgAllowed(orgId: string): boolean {
  const operatorOrg = process.env.XYRA_OPERATOR_ORG_ID;
  if (operatorOrg) return orgId === operatorOrg;
  return process.env.NODE_ENV !== "production";
}

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
  if (!operatorOrgAllowed(profile.org_id)) {
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
  return operatorOrgAllowed(orgId);
}
