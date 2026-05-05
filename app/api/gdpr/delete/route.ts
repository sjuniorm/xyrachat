import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/gdpr/delete
// Right-of-erasure — soft-deletes the calling user's profile and (if they are
// the only owner) the organization too. Cascade soft-delete for all tables
// that reference org_id (channels, contacts, conversations, messages, bots, …)
// must be added here as those tables are introduced.
//
// Hard-deletes the auth.users row via the admin client so the user cannot log
// back in. The cascade in the auth schema removes session/refresh tokens.
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

  // Soft-delete the profile.
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .update({ deleted_at: now })
    .eq("id", user.id)
    .select("org_id, role")
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  // If the user was the sole owner of an org, soft-delete the org too.
  // Add cascade soft-deletes for org-scoped tables here as they are added.
  if (profile?.org_id && profile.role === "owner") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", profile.org_id)
      .eq("role", "owner")
      .is("deleted_at", null);

    if ((count ?? 0) === 0) {
      await admin
        .from("organizations")
        .update({ deleted_at: now })
        .eq("id", profile.org_id);
    }
  }

  // Hard-delete the auth user so they cannot sign in again.
  const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
