import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/gdpr/delete
// Right-of-erasure for the calling user. If they are the SOLE remaining owner of
// their org, the entire workspace is cascade-soft-deleted via the
// soft_delete_org() RPC (covers every org-scoped table — see migration 064) and
// the 30-day retention purge later hard-removes it. If other owners remain, only
// the caller's own profile is removed (the shared workspace survives).
//
// Either way the auth.users row is hard-deleted so the user cannot sign in again
// (the auth-schema cascade clears their sessions/refresh tokens).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Read the caller's org + role BEFORE mutating.
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  let workspaceDeleted = false;
  if (profile?.org_id && profile.role === "owner") {
    // Count OTHER active owners (exclude the caller).
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", profile.org_id)
      .eq("role", "owner")
      .neq("id", user.id)
      .is("deleted_at", null);

    if ((count ?? 0) === 0) {
      // Sole owner → erase the whole workspace (every org-scoped table).
      const { error: rpcErr } = await admin.rpc("soft_delete_org", {
        p_org_id: profile.org_id,
      });
      if (rpcErr) {
        return NextResponse.json({ error: rpcErr.message }, { status: 500 });
      }
      // Start the 30-day retention clock so the purge job hard-removes it.
      await admin
        .from("subscriptions")
        .update({ data_retention_until: new Date(Date.now() + 30 * 86_400_000).toISOString() })
        .eq("org_id", profile.org_id);
      workspaceDeleted = true;
    }
  }

  // If the workspace wasn't wholesale-deleted, just soft-delete the caller's
  // own profile (they leave; the org keeps running for the other members).
  if (!workspaceDeleted) {
    await admin.from("profiles").update({ deleted_at: now }).eq("id", user.id);
  }

  // Hard-delete the auth user so they cannot sign in again.
  const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, workspace_deleted: workspaceDeleted });
}
