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

  await trackServer("org_created", user.id, { org_id: orgId as string });

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
