import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultCreateSecret } from "@/lib/supabase/vault";
import { assertCanAddChannel } from "@/lib/billing/gates";
import { NewChannelForm } from "./new-channel-form";

async function createChannelAction(
  formData: FormData,
): Promise<{ error?: string }> {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const phoneNumberId = String(formData.get("phone_number_id") ?? "").trim();
  const wabaId = String(formData.get("waba_id") ?? "").trim();
  const accessToken = String(formData.get("access_token") ?? "").trim();

  if (!name) return { error: "Channel name is required." };
  if (!phoneNumberId) return { error: "Phone Number ID is required." };
  if (!accessToken) return { error: "Access token is required." };

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

  // Plan gate — count cap + whatsapp availability. Fails open for
  // un-provisioned orgs (see lib/billing/entitlements isProvisioned).
  const gate = await assertCanAddChannel(orgId, "whatsapp");
  if (!gate.ok) return { error: gate.error };

  // Store token in Vault — vault.create_secret returns the secret UUID, which
  // is the only thing we persist in channels.access_token_vault_id.
  let vaultId: string;
  try {
    vaultId = await vaultCreateSecret(
      accessToken,
      `whatsapp-${phoneNumberId}-${Date.now()}`,
      `WhatsApp access token for ${name}`,
    );
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Vault not available: ${err.message}. Enable Vault in Project Settings → Vault.`
          : "Failed to store token in Vault.",
    };
  }

  const webhookSecret = randomBytes(24).toString("hex");

  // Insert via admin: RLS would allow the user-scoped client too (org-scoped
  // policy), but we use admin to keep the token-handling path consistent.
  const admin = createAdminClient();
  const { error: insertErr } = await admin.from("channels").insert({
    org_id: orgId,
    type: "whatsapp",
    name,
    phone_number_id: phoneNumberId,
    wa_business_account_id: wabaId || null,
    access_token_vault_id: vaultId,
    webhook_secret: webhookSecret,
    active: true,
  });
  if (insertErr) return { error: insertErr.message };

  redirect("/settings/channels");
}

export default async function NewChannelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Build the absolute webhook URL the user pastes into Meta App Dashboard.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "xyra-chat.vercel.app";
  const webhookUrl = `${proto}://${host}/api/webhooks/whatsapp`;
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "";

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Connect WhatsApp Business
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste the credentials from your Meta App Dashboard. Embedded Signup for
            real clients lands in Week 9.
          </p>
        </header>

        <NewChannelForm
          action={createChannelAction}
          webhookUrl={webhookUrl}
          verifyToken={verifyToken}
        />
      </div>
    </div>
  );
}
