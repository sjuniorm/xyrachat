import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/gdpr/export
// Right-of-access — returns a JSON dump of every record about the calling user
// and (if they belong to one) the user's organization. Add new tables here as
// they are introduced (channels, contacts, conversations, messages, …).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  let organization: unknown = null;
  if (profile?.org_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", profile.org_id)
      .maybeSingle();
    organization = org ?? null;
  }

  const payload = {
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
    },
    profile,
    organization,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="xyra-export-${user.id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
