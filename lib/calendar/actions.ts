"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultForgetSecret } from "@/lib/supabase/vault";

type Result = { ok: true } | { ok: false; error: string };

// Disconnect a calendar — owner/admin only, org-scoped. Forgets the Vault
// tokens and soft-deletes the row. (Connecting is the OAuth /start route.)
export async function disconnectCalendar(connectionId: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: me } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me?.org_id) return { ok: false, error: "Not in an org." };
  if (me.role !== "owner" && me.role !== "admin") {
    return { ok: false, error: "Only owners and admins can manage calendars." };
  }

  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("calendar_connections")
    .select("id, org_id, access_token_vault_id, refresh_token_vault_id")
    .eq("id", connectionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!conn || conn.org_id !== me.org_id) return { ok: false, error: "Connection not found." };

  if (conn.access_token_vault_id) await vaultForgetSecret(conn.access_token_vault_id).catch(() => {});
  if (conn.refresh_token_vault_id) await vaultForgetSecret(conn.refresh_token_vault_id).catch(() => {});

  await admin
    .from("calendar_connections")
    .update({ status: "revoked", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", conn.id);

  revalidatePath("/settings/calendar");
  return { ok: true };
}
