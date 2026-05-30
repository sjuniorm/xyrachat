import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUNDLES, type BundleId } from "@/lib/billing/bundles";

export const runtime = "nodejs";

// POST /api/billing/preview-downgrade { target_plan: 'starter' }
// Returns { ok, blockers: [...] } — before a downgrade goes to Stripe,
// check the org isn't over the target plan's limits. If it is, the UI
// shows a checklist instead of proceeding (block-and-prompt model).
type Blocker = {
  feature: string;
  current: number;
  target_limit: number;
  message: string;
  resolve_url: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 403 });
  if (profile.role !== "owner") {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  let body: { target_plan?: BundleId };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const target = body.target_plan;
  if (!target || !BUNDLES[target]) {
    return NextResponse.json({ error: "Unknown target plan" }, { status: 400 });
  }
  const bundle = BUNDLES[target];
  const orgId = profile.org_id;
  const admin = createAdminClient();

  // Live usage vs target limits. -1 in the bundle = unlimited (no blocker).
  const num = (k: string) => parseInt((bundle.entitlements[k as keyof typeof bundle.entitlements] as string | undefined) ?? "-1", 10);

  const [chan, bots, members] = await Promise.all([
    admin.from("channels").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
    admin.from("bots").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
  ]);

  const blockers: Blocker[] = [];
  const checks: Array<{ key: string; current: number; label: string; url: string }> = [
    { key: "channels:max", current: chan.count ?? 0, label: "channels", url: "/settings/channels" },
    { key: "bots:max", current: bots.count ?? 0, label: "bots", url: "/bots" },
    { key: "team_members:max", current: members.count ?? 0, label: "team members", url: "/settings/team" },
  ];
  for (const c of checks) {
    const limit = num(c.key);
    if (limit !== -1 && c.current > limit) {
      blockers.push({
        feature: c.label,
        current: c.current,
        target_limit: limit,
        message: `You have ${c.current} ${c.label} but ${bundle.name} allows ${limit}. Remove ${c.current - limit} before downgrading.`,
        resolve_url: c.url,
      });
    }
  }

  return NextResponse.json({ ok: blockers.length === 0, blockers, target_plan: target });
}
