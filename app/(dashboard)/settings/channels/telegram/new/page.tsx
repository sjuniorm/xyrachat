import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultCreateSecret } from "@/lib/supabase/vault";
import { NewTelegramChannelForm } from "./new-telegram-channel-form";

async function createTelegramChannelAction(
  formData: FormData,
): Promise<{ error?: string }> {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const token = String(formData.get("bot_token") ?? "").trim();
  if (!name) return { error: "Channel name is required." };
  if (!token) return { error: "Bot token is required." };
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    return { error: "That doesn't look like a Telegram bot token (format `12345:ABC…`)." };
  }

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

  // 1. Verify the token works by calling getMe — also gets us the bot's
  //    own username + display name for the channel record.
  const me = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const meJson = (await me.json().catch(() => null)) as
    | { ok: boolean; result?: { id: number; username: string; first_name: string } }
    | null;
  if (!me.ok || !meJson?.ok || !meJson.result) {
    return {
      error: "Telegram rejected this bot token. Double-check the value from @BotFather.",
    };
  }
  const bot = meJson.result;

  // 2. Generate a per-channel webhook secret_token. Telegram echoes it on
  //    every webhook call (header X-Telegram-Bot-Api-Secret-Token) — we
  //    look up the channel by it. Treat as low-sensitivity (possession
  //    alone doesn't grant anything; you'd still need to forge a valid
  //    payload), but rotate if leaked.
  const secret = randomBytes(24).toString("hex");

  // 3. Tell Telegram where to deliver updates.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "xyra-chat.vercel.app";
  const webhookUrl = `${proto}://${host}/api/webhooks/telegram`;

  const setWh = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });
  const setWhJson = (await setWh.json().catch(() => null)) as
    | { ok: boolean; description?: string }
    | null;
  if (!setWh.ok || !setWhJson?.ok) {
    return {
      error: `Telegram rejected setWebhook: ${setWhJson?.description ?? `HTTP ${setWh.status}`}.`,
    };
  }

  // 4. Store the raw token in Vault, channel record holds the vault UUID
  //    + the secret_token (in webhook_secret for lookup) + display info.
  let vaultId: string;
  try {
    vaultId = await vaultCreateSecret(
      token,
      `telegram-${bot.username}-${Date.now()}`,
      `Telegram bot token for @${bot.username}`,
    );
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Vault not available: ${err.message}`
          : "Couldn't store token in Vault.",
    };
  }

  const admin = createAdminClient();
  const { error: insertErr } = await admin.from("channels").insert({
    org_id: orgId,
    type: "telegram",
    name,
    bot_username: bot.username,
    webhook_secret: secret,
    access_token_vault_id: vaultId,
    active: true,
    metadata: {
      bot_id: bot.id,
      bot_first_name: bot.first_name,
    },
  });
  if (insertErr) return { error: insertErr.message };

  redirect("/settings/channels?connected=telegram");
}

export default async function NewTelegramChannelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Connect a Telegram bot
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Get a token from @BotFather, paste it below — Xyra registers the
            webhook automatically.
          </p>
        </header>

        <NewTelegramChannelForm action={createTelegramChannelAction} />
      </div>
    </div>
  );
}
