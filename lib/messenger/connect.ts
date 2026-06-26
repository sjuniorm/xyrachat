import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultCreateSecret } from "@/lib/supabase/vault";

const META_GRAPH_VERSION = "v22.0";
// Fields the Page must subscribe the app to so Messenger delivers to our
// webhook. messages = inbound DMs; postbacks = button taps; deliveries/reads =
// receipts (handleStatus).
const SUBSCRIBED_FIELDS = "messages,messaging_postbacks,message_deliveries,message_reads";

export type MessengerPage = { id: string; name: string; access_token: string };

// Lists the Facebook Pages the connecting user manages (this is the
// `pages_show_list` permission in use) — includes a per-Page access token.
export async function listMessengerPages(
  userToken: string,
): Promise<{ ok: true; pages: MessengerPage[] } | { ok: false; error: string }> {
  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts?fields=id,name,access_token`,
    { headers: { Authorization: `Bearer ${userToken}` } },
  );
  const json = (await res.json().catch(() => null)) as
    | { data?: MessengerPage[]; error?: { message: string } }
    | null;
  if (!res.ok || json?.error) {
    return { ok: false, error: json?.error?.message ?? `Couldn't list your Facebook Pages (HTTP ${res.status}).` };
  }
  return { ok: true, pages: json?.data ?? [] };
}

// Subscribes the chosen Page to our app's webhook (also validates the Page
// token), stores the token in Vault, and creates the channel row. Shared by the
// OAuth callback (single Page) and the multi-Page chooser action.
export async function connectMessengerPage(
  orgId: string,
  userId: string,
  page: MessengerPage,
  name?: string,
): Promise<{ ok: true; pageName: string } | { ok: false; error: string }> {
  const subRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${page.id}/subscribed_apps?subscribed_fields=${SUBSCRIBED_FIELDS}`,
    { method: "POST", headers: { Authorization: `Bearer ${page.access_token}` } },
  );
  if (!subRes.ok) {
    const j = (await subRes.json().catch(() => null)) as { error?: { message: string } } | null;
    return { ok: false, error: j?.error?.message ?? `Couldn't subscribe the Page (HTTP ${subRes.status}).` };
  }

  let vaultId: string;
  try {
    vaultId = await vaultCreateSecret(
      page.access_token,
      `messenger-oauth-${page.id}-${Date.now()}`,
      `Facebook Page token for ${page.name}`,
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `Vault: ${err.message}` : "Vault store failed." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("channels").insert({
    org_id: orgId,
    type: "facebook",
    name: name?.trim() || page.name,
    page_id: page.id,
    access_token_vault_id: vaultId,
    active: true,
    metadata: { page_name: page.name, oauth: { connected_at: new Date().toISOString(), user_id: userId } },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, pageName: page.name };
}
