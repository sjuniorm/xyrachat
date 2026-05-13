import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// TEMPORARY — Week 4 onboarding-bounce debugging. Remove once we close the bug.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  let profileUserScope: unknown = null;
  let userScopeError: unknown = null;
  let profileAdminScope: unknown = null;
  let adminScopeError: unknown = null;
  let authUidViaSql: string | null = null;

  if (user) {
    const userScope = await supabase
      .from("profiles")
      .select("id, email, org_id, role, deleted_at")
      .eq("id", user.id)
      .maybeSingle();
    profileUserScope = userScope.data;
    userScopeError = userScope.error;

    const admin = createAdminClient();
    const adminScope = await admin
      .from("profiles")
      .select("id, email, org_id, role, deleted_at")
      .eq("id", user.id)
      .maybeSingle();
    profileAdminScope = adminScope.data;
    adminScopeError = adminScope.error;

    // What does the DB think auth.uid() is for this exact request? Compare
    // against user.id from getUser() — they should match if the cookies are
    // forwarding the JWT correctly to Postgres.
    const { data: uidData } = await supabase.rpc("debug_auth_uid").maybeSingle();
    if (uidData && typeof uidData === "object" && "uid" in uidData) {
      authUidViaSql = (uidData as { uid: string | null }).uid;
    }
  }

  return NextResponse.json({
    getUser: user
      ? { id: user.id, email: user.email }
      : { error: authError?.message ?? "no user" },
    auth_uid_inside_db: authUidViaSql,
    profile_via_user_session: { row: profileUserScope, error: userScopeError },
    profile_via_admin_client: { row: profileAdminScope, error: adminScopeError },
  });
}
