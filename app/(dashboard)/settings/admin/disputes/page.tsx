import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOperatorProfile } from "@/lib/admin/operator";
import { DisputesAdmin } from "./disputes-admin";

export default async function DisputesAdminPage() {
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
  const { data: disputes } = await admin
    .from("disputes")
    .select("id, stripe_dispute_id, org_id, amount_cents, currency, reason, status, evidence_due_by, evidence_submitted_at, admin_notes, created_at, organizations:organizations!disputes_org_id_fkey(name)")
    .order("created_at", { ascending: false });

  const rows = (disputes ?? []).map((d) => ({
    id: d.id,
    stripe_dispute_id: d.stripe_dispute_id,
    org_name: (d.organizations as { name?: string } | null)?.name ?? "—",
    amount_cents: d.amount_cents,
    currency: d.currency,
    reason: d.reason,
    status: d.status,
    evidence_due_by: d.evidence_due_by,
    evidence_submitted_at: d.evidence_submitted_at,
    admin_notes: d.admin_notes,
  }));

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Disputes (operator)</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chargebacks. Evidence is auto-submitted on creation; you can
            re-submit or add notes here. Stripe gives ~7 days — don&apos;t let
            one sit.
          </p>
        </header>
        <DisputesAdmin disputes={rows} />
      </div>
    </div>
  );
}
