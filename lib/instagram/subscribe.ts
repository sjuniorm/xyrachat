import "server-only";

const IG_GRAPH_VERSION = "v22.0";

/**
 * Tells Meta to start delivering webhook events for this specific Instagram
 * account. The app-level webhook (configured in Meta App Dashboard) only
 * declares WHICH fields the app cares about — it doesn't actually start
 * routing events for any given account until that account is subscribed
 * via this call.
 *
 * Easy step to miss: an account can authorize and look fully connected, but
 * if this call never happens, no DMs arrive at our webhook.
 *
 * Returns true on success (Meta returns { success: true }).
 */
export async function subscribeIgWebhooks(
  igUserId: string,
  token: string,
): Promise<boolean> {
  const u = new URL(
    `https://graph.instagram.com/${IG_GRAPH_VERSION}/${igUserId}/subscribed_apps`,
  );
  u.searchParams.set(
    "subscribed_fields",
    "messages,messaging_postbacks,message_reactions,messaging_referral",
  );
  u.searchParams.set("access_token", token);
  try {
    const res = await fetch(u.toString(), { method: "POST" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[ig subscribe] non-ok response", res.status, body);
      return false;
    }
    const j = (await res.json().catch(() => null)) as { success?: boolean } | null;
    return Boolean(j?.success);
  } catch (err) {
    console.warn("[ig subscribe] threw", err);
    return false;
  }
}
