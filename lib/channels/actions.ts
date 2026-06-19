"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret, vaultUpdateSecret } from "@/lib/supabase/vault";
import { emit } from "@/lib/api/emit";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Replace the stored access token for a channel. The vault UUID stays the
 * same — we just overwrite the secret behind it via vault.update_secret.
 * Owners + admins only.
 */
export async function rotateChannelToken(
  formData: FormData,
): Promise<ActionResult> {
  const channelId = String(formData.get("channel_id") ?? "");
  const newToken = String(formData.get("access_token") ?? "").trim();

  if (!channelId) return { ok: false, error: "Missing channel id." };
  if (!newToken) return { ok: false, error: "Token can't be empty." };
  if (newToken.length < 20) {
    return { ok: false, error: "That doesn't look like a valid token." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: me } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.org_id) return { ok: false, error: "Not in an org." };
  if (me.role === "agent") {
    return { ok: false, error: "Only owners and admins can rotate tokens." };
  }

  const admin = createAdminClient();
  const { data: channel, error: chErr } = await admin
    .from("channels")
    .select("id, org_id, access_token_vault_id")
    .eq("id", channelId)
    .maybeSingle();
  if (chErr || !channel) return { ok: false, error: "Channel not found." };
  if (channel.org_id !== me.org_id) {
    return { ok: false, error: "Not your org's channel." };
  }
  if (!channel.access_token_vault_id) {
    return { ok: false, error: "Channel has no vault entry — re-create it." };
  }

  try {
    await vaultUpdateSecret(channel.access_token_vault_id, newToken);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Vault update failed.",
    };
  }

  revalidatePath("/settings/channels");
  return { ok: true };
}

/**
 * Disconnect a channel — soft-deletes the row AND does provider-specific
 * external cleanup so the upstream service stops sending us events:
 *   - Telegram: deleteWebhook so the bot stops POSTing to us. The bot
 *     itself stays alive on Telegram's side; reconnecting later just
 *     re-runs setWebhook.
 *   - WhatsApp / Instagram / Email: nothing externally — Meta keeps the
 *     subscription but our channel record is gone so webhooks won't
 *     match a row. Resend stops once the inbox_email row is deleted.
 *
 * Owners + admins only. Existing conversations stay readable in history;
 * they just can't receive new inbound or send new outbound.
 */
export async function disconnectChannel(
  formData: FormData,
): Promise<ActionResult> {
  const channelId = String(formData.get("channel_id") ?? "");
  if (!channelId) return { ok: false, error: "Missing channel id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: me } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.org_id) return { ok: false, error: "Not in an org." };
  if (me.role === "agent") {
    return { ok: false, error: "Only owners and admins can disconnect channels." };
  }

  const admin = createAdminClient();
  const { data: channel, error: chErr } = await admin
    .from("channels")
    .select("id, org_id, type, access_token_vault_id")
    .eq("id", channelId)
    .maybeSingle();
  if (chErr || !channel) return { ok: false, error: "Channel not found." };
  if (channel.org_id !== me.org_id) {
    return { ok: false, error: "Not your org's channel." };
  }

  // Telegram: tell the API to stop sending us updates. Best-effort —
  // failure here shouldn't block the local soft-delete.
  if (channel.type === "telegram" && channel.access_token_vault_id) {
    try {
      const token = await vaultReadSecret(channel.access_token_vault_id);
      if (token) {
        await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
          method: "POST",
        });
      }
    } catch (err) {
      console.warn("[disconnect] telegram deleteWebhook failed", err);
    }
  }

  const { error: updErr } = await admin
    .from("channels")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", channelId);
  if (updErr) return { ok: false, error: updErr.message };

  // Outbound webhook event for external integrations.
  void emit({
    type: "channel.disconnected",
    orgId: channel.org_id,
    data: { id: channel.id, channel_type: channel.type },
  }).catch(() => {});

  revalidatePath("/settings/channels");
  return { ok: true };
}
