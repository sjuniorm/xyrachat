import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOperatorProfile } from "@/lib/admin/operator";
import { ClientsTable, type ClientRow } from "./clients-table";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
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
        <p className="text-sm text-white/60">Operators only.</p>
      </div>
    );
  }

  const admin = createAdminClient();
  const [{ data: orgs }, { data: subs }, { data: ents }] = await Promise.all([
    admin.from("organizations").select("id, name, created_at").is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("subscriptions").select("org_id, plan, status, trial_ends_at"),
    admin.from("org_entitlements").select("org_id"),
  ]);

  const subByOrg: Record<string, { plan: string; status: string; trial_ends_at: string | null }> = {};
  for (const s of subs ?? []) subByOrg[s.org_id] = { plan: s.plan, status: s.status, trial_ends_at: s.trial_ends_at };
  const provisioned = new Set((ents ?? []).map((e) => e.org_id));

  const rows: ClientRow[] = (orgs ?? []).map((o) => ({
    id: o.id,
    name: (o.name as string) ?? "—",
    created_at: o.created_at as string,
    plan: subByOrg[o.id]?.plan ?? "—",
    status: subByOrg[o.id]?.status ?? "—",
    trial_ends_at: subByOrg[o.id]?.trial_ends_at ?? null,
    provisioned: provisioned.has(o.id),
  }));

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/settings/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="size-3.5" /> Operator console
        </Link>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} organization{rows.length === 1 ? "" : "s"}. Click one to manage.
          </p>
        </header>
        <ClientsTable rows={rows} />
      </div>
    </div>
  );
}
