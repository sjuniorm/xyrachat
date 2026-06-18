"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultForgetSecret } from "@/lib/supabase/vault";

type Result = { ok: true } | { ok: false; error: string };

// Disconnect a CRM — owner/admin only, org-scoped. Forgets the Vault tokens +
// soft-deletes the row. (Connecting is the OAuth /start route.)
export async function disconnectCrm(connectionId: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: me } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me?.org_id) return { ok: false, error: "Not in an org." };
  if (me.role !== "owner" && me.role !== "admin") {
    return { ok: false, error: "Only owners and admins can manage integrations." };
  }

  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("crm_connections")
    .select("id, org_id, access_token_vault_id, refresh_token_vault_id")
    .eq("id", connectionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!conn || conn.org_id !== me.org_id) return { ok: false, error: "Connection not found." };

  if (conn.access_token_vault_id) await vaultForgetSecret(conn.access_token_vault_id).catch(() => {});
  if (conn.refresh_token_vault_id) await vaultForgetSecret(conn.refresh_token_vault_id).catch(() => {});

  await admin
    .from("crm_connections")
    .update({ status: "revoked", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", conn.id);

  revalidatePath("/settings/crm");
  return { ok: true };
}
