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

  // 2. App-level guard: one org per user.
  const { data: existing } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing?.org_id) redirect("/dashboard");

  // 3. Create org + link profile via the service-role client.
  // Caller is already verified above. RLS is the right gate for client-direct
  // queries; trusted server actions doing org-level setup mutate via admin.
  const admin = createAdminClient();

  const baseSlug = slugify(name) || "org";
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name, slug })
    .select("id, plan")
    .single();
  if (orgErr || !org) return { error: orgErr?.message ?? "Could not create org." };

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ org_id: org.id, role: "owner" })
    .eq("id", user.id);
  if (profileErr) return { error: profileErr.message };

  await trackServer("org_created", user.id, { org_id: org.id, plan: org.plan });

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
