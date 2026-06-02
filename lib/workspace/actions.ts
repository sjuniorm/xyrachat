"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackServer } from "@/lib/analytics-server";

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Create an ADDITIONAL workspace for the signed-in user and switch them into
 * it as owner. (Unlike onboarding's create_org_and_link, there's no
 * "already has an org" guard — that's the whole point of multi-org.)
 * Goes through the service-role admin client → create_additional_workspace.
 */
export async function createWorkspace(
  name: string,
): Promise<{ ok: boolean; orgId?: string; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Workspace name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const slug = `${slugify(trimmed) || "org"}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: orgId, error } = await admin.rpc("create_additional_workspace", {
    p_user_id: user.id,
    p_name: trimmed,
    p_slug: slug,
  });
  if (error) return { ok: false, error: error.message };

  await trackServer("org_created", user.id, { org_id: orgId as string });
  return { ok: true, orgId: orgId as string };
}
