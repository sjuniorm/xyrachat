import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOperatorProfile } from "@/lib/admin/operator";
import { PromosAdmin } from "./promos-admin";

export default async function PromosAdminPage() {
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
  const { data: codes } = await admin
    .from("promo_codes")
    .select("id, code, kind, description, percent_off, amount_off_cents, trial_days, max_redemptions, redemption_count, expires_at, active, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Promo codes (operator)</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discounts, free months, and free-trial codes. Stripe is the source
            of truth for discount redemption; trial codes apply directly.
          </p>
        </header>
        <PromosAdmin codes={codes ?? []} />
      </div>
    </div>
  );
}
