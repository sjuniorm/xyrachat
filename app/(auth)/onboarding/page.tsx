import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackServer } from "@/lib/analytics-server";
import { OnboardingForm } from "./onboarding-form";

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function createOrgAction(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Organization name is required." };

  // 1. Authenticate the caller via the user-scoped client (cookie session).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // 2. App-level guard: one org per user. If they already have one,
  //    short-circuit before doing any work.
  const { data: existing } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing?.org_id) redirect("/dashboard");

  // 3. Atomic org-creation via SECURITY DEFINER function (migration 008).
  //    Two-step INSERT + UPDATE is no longer split across separate Postgres
  //    calls — the function either creates both rows or neither (transaction),
  //    so a silent zero-row UPDATE can't leave an orphan org behind.
  const admin = createAdminClient();
  const baseSlug = slugify(name) || "org";
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;

  const { data: orgId, error: rpcErr } = await admin.rpc(
    "create_org_and_link",
    {
      p_user_id: user.id,
      p_name: name,
      p_slug: slug,
    },
  );
  if (rpcErr) return { error: rpcErr.message };
  if (!orgId) return { error: "Could not create org." };

  // Provision the Trial bundle so plan gates enforce from day one. Without this
  // a new org has ZERO entitlement rows → the fail-open backstop treats it as
  // unlimited-everything. Also stamp the trial window on the subscription (the
  // migration-017 trigger created a free row) so the trial-end reminder + the
  // billing UI work. Fail-soft: a provisioning hiccup must not block signup.
  try {
    const { provisionBundle } = await import("@/lib/billing/provision");
    const { BUNDLES } = await import("@/lib/billing/bundles");
    const trialEnds = new Date(
      Date.now() + BUNDLES.trial.trialDays * 86_400_000,
    ).toISOString();
    // expiresAt = null on purpose: if the trial entitlement rows themselves
    // expired, getEntitlement/hasFeature/getLimit would see ZERO active rows
    // while isProvisioned() (which ignores expiry) still returns true — i.e.
    // STRICT mode with no entitlements = total feature lockout for every
    // non-converting trial. Instead the rows never expire; trial state is
    // tracked on subscriptions.status / trial_ends_at and surfaced by the
    // billing banner + reminders. The post-trial paywall is a deliberate
    // product decision, not an accidental hard-stop.
    await provisionBundle({
      orgId: orgId as string,
      bundleId: "trial",
      stripeSubscriptionId: null,
      expiresAt: null,
    });
    await admin
      .from("subscriptions")
      .update({
        plan: "trial",
        status: "trialing",
        trial_ends_at: trialEnds,
        trial_source: "signup",
      })
      .eq("org_id", orgId as string);
  } catch (err) {
    console.error("[onboarding] trial provisioning failed (continuing)", err);
  }

  await trackServer("org_created", user.id, { org_id: orgId as string });

  // Branded welcome email — fail-soft, never blocks onboarding. Delivery is
  // gated on the Resend domain being configured; until then it skips cleanly.
  // The try/catch also guards the dynamic import so nothing here can throw.
  if (user.email) {
    try {
      const { sendWelcomeEmail } = await import("@/lib/email/send");
      await sendWelcomeEmail(user.email, name);
    } catch {
      // swallow — a welcome-email hiccup must never block onboarding
    }
  }

  redirect("/dashboard");
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // If they already have an org, skip onboarding.
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.org_id) redirect("/dashboard");

  return <OnboardingForm action={createOrgAction} />;
}
