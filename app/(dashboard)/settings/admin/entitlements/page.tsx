import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOperatorProfile } from "@/lib/admin/operator";
import { EntitlementsAdmin } from "./entitlements-admin";

// Operator-only entitlements console. Doubles as the launch backfill
// tool: pick your org → assign a bundle. Access = owner of the Xyra
// operator org (XYRA_OPERATOR_ORG_ID), or any owner pre-launch when
// that env var is unset.
export default async function EntitlementsAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  if (!isOperatorProfile(profile.role, profile.org_id)) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <p className="text-sm text-white/60">
          This page is for Xyra Chat operators only.
        </p>
      </div>
    );
  }

  // Load all orgs + their entitlement rows + subscription plan label.
  const admin = createAdminClient();
  const [{ data: orgs }, { data: ents }, { data: subs }] = await Promise.all([
    admin.from("organizations").select("id, name, created_at").is("deleted_at", null).order("created_at", { ascending: true }),
    admin.from("org_entitlements").select("id, org_id, feature_key, value, source, expires_at"),
    admin.from("subscriptions").select("org_id, plan, status"),
  ]);

  const entByOrg: Record<string, Array<{ id: string; feature_key: string; value: string; source: string; expires_at: string | null }>> = {};
  for (const e of ents ?? []) {
    (entByOrg[e.org_id] ??= []).push(e);
  }
  const subByOrg: Record<string, { plan: string; status: string }> = {};
  for (const s of subs ?? []) {
    subByOrg[s.org_id] = { plan: s.plan, status: s.status };
  }

  const orgsData = (orgs ?? []).map((o) => ({
    id: o.id,
    name: o.name as string,
    plan: subByOrg[o.id]?.plan ?? "—",
    status: subByOrg[o.id]?.status ?? "—",
    entitlements: entByOrg[o.id] ?? [],
    provisioned: (entByOrg[o.id] ?? []).length > 0,
  }));

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Entitlements (operator)</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Provision bundles + grant per-org overrides. Un-provisioned orgs
            fail open (everything allowed) until you assign a bundle here.
          </p>
        </header>
        <EntitlementsAdmin orgs={orgsData} />
      </div>
    </div>
  );
}
