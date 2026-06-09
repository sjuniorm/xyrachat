"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function setSurveyKind(kind: "off" | "csat" | "nps"): Promise<ActionResult> {
  if (!["off", "csat", "nps"].includes(kind)) return { ok: false, error: "Invalid option." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return { ok: false, error: "Not in an org." };
  if (!["owner", "admin"].includes(profile.role ?? "")) {
    return { ok: false, error: "Owners and admins only." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ survey_kind: kind })
    .eq("id", profile.org_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/inbox");
  return { ok: true };
}
