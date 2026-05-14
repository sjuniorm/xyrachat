import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultCreateSecret } from "@/lib/supabase/vault";
import { NewInstagramChannelForm } from "./new-instagram-channel-form";

async function createInstagramChannelAction(
  formData: FormData,
): Promise<{ error?: string }> {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const pageId = String(formData.get("page_id") ?? "").trim();
  const igAccountId = String(formData.get("ig_business_account_id") ?? "").trim();
  const accessToken = String(formData.get("access_token") ?? "").trim();
  const igUsername = String(formData.get("ig_username") ?? "").trim();

  if (!name) return { error: "Channel name is required." };
  if (!pageId) return { error: "Facebook Page ID is required." };
  if (!igAccountId) return { error: "Instagram Business Account ID is required." };
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

  let vaultId: string;
  try {
    vaultId = await vaultCreateSecret(
      accessToken,
      `instagram-${pageId}-${Date.now()}`,
      `Instagram Page access token for ${name}`,
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
    type: "instagram",
    name,
    page_id: pageId,
    ig_business_account_id: igAccountId,
    access_token_vault_id: vaultId,
    active: true,
    metadata: igUsername ? { ig_username: igUsername } : {},
  });
  if (insertErr) return { error: insertErr.message };

  redirect("/settings/channels?connected=instagram");
}

export default async function NewInstagramChannelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "xyra-chat.vercel.app";
  const webhookUrl = `${proto}://${host}/api/webhooks/instagram`;
  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "";
  const oauthAvailable = Boolean(process.env.META_APP_ID);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Connect Instagram DM
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use Sign in with Facebook for the smooth path, or paste credentials
            from your Meta App Dashboard if you're testing.
          </p>
        </header>

        <NewInstagramChannelForm
          action={createInstagramChannelAction}
          webhookUrl={webhookUrl}
          verifyToken={verifyToken}
          oauthAvailable={oauthAvailable}
        />
      </div>
    </div>
  );
}
