import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultCreateSecret } from "@/lib/supabase/vault";
import { assertCanAddChannel } from "@/lib/billing/gates";
import { NewMessengerChannelForm } from "./new-messenger-channel-form";

const META_GRAPH_VERSION = "v22.0";

// Fields the Page must subscribe the app to so Messenger delivers to our
// webhook. messages = inbound DMs; postbacks = button taps; deliveries/reads =
// receipts (handleStatus).
const SUBSCRIBED_FIELDS = "messages,messaging_postbacks,message_deliveries,message_reads";

async function createMessengerChannelAction(
  formData: FormData,
): Promise<{ error?: string }> {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const pageId = String(formData.get("page_id") ?? "").trim();
  const accessToken = String(formData.get("access_token") ?? "").trim();

  if (!name) return { error: "Channel name is required." };
  if (!pageId) return { error: "Facebook Page ID is required." };
  if (!/^\d+$/.test(pageId)) {
    return { error: "Page ID should be all digits (find it under Page → About → Page transparency)." };
  }
  if (!accessToken) return { error: "Page access token is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = profile?.org_id;
  if (!orgId) return { error: "You must belong to an organization." };

  const gate = await assertCanAddChannel(orgId, "facebook");
  if (!gate.ok) return { error: gate.error };

  // 1. Subscribe the Page to our app's webhooks. This both validates the
  //    token (it must be a Page access token for THIS page) and wires
  //    delivery — Messenger won't push events until the page is subscribed.
  const subRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}/subscribed_apps?subscribed_fields=${SUBSCRIBED_FIELDS}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const subJson = (await subRes.json().catch(() => null)) as
    | { success?: boolean; error?: { message: string } }
    | null;
  if (!subRes.ok || subJson?.error || !subJson?.success) {
    return {
      error:
        subJson?.error?.message ??
        `Meta rejected the page subscription (HTTP ${subRes.status}). Check the Page ID and that the token is a Page access token with pages_messaging.`,
    };
  }

  // 2. Optional: capture the Page's display name (fail-soft).
  let pageName: string | null = null;
  try {
    const meRes = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${pageId}?fields=name`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const meJson = (await meRes.json().catch(() => null)) as { name?: string } | null;
    pageName = meJson?.name ?? null;
  } catch {
    // ignore — display name is cosmetic
  }

  // 3. Store the Page token in Vault; the channel row holds only the UUID.
  let vaultId: string;
  try {
    vaultId = await vaultCreateSecret(
      accessToken,
      `messenger-${pageId}-${Date.now()}`,
      `Facebook Page access token for ${name}`,
    );
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Vault not available: ${err.message}. Enable Vault in Project Settings → Vault.`
          : "Failed to store token in Vault.",
    };
  }

  const admin = createAdminClient();
  const { error: insertErr } = await admin.from("channels").insert({
    org_id: orgId,
    type: "facebook",
    name,
    page_id: pageId,
    access_token_vault_id: vaultId,
    active: true,
    metadata: pageName ? { page_name: pageName } : {},
  });
  if (insertErr) return { error: insertErr.message };

  redirect("/settings/channels?connected=messenger");
}

export default async function NewMessengerChannelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "xyra-chat.vercel.app";
  const webhookUrl = `${proto}://${host}/api/webhooks/messenger`;
  const verifyToken = process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN ?? "";

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Connect Facebook Messenger
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste your Facebook Page ID and a Page access token. Xyra subscribes
            the page to the webhook for you.
          </p>
        </header>

        <NewMessengerChannelForm
          action={createMessengerChannelAction}
          webhookUrl={webhookUrl}
          verifyToken={verifyToken}
        />
      </div>
    </div>
  );
}
