import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertCanAddChannel } from "@/lib/billing/gates";
import { NewWebchatChannelForm } from "./new-webchat-channel-form";

type ActionResult = { error?: string; publicKey?: string };

async function createWebchatChannelAction(formData: FormData): Promise<ActionResult> {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  const greeting = String(formData.get("greeting") ?? "").trim().slice(0, 300);
  const launcher = String(formData.get("launcher_text") ?? "").trim().slice(0, 24);
  let color = String(formData.get("color") ?? "").trim();
  if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) color = "#9333EA"; // never store an unsafe color

  if (!name) return { error: "Channel name is required." };

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

  const gate = await assertCanAddChannel(orgId, "webchat");
  if (!gate.ok) return { error: gate.error };

  const publicKey = `xyra_wc_${randomBytes(16).toString("hex")}`;
  const admin = createAdminClient();
  const { error } = await admin.from("channels").insert({
    org_id: orgId,
    type: "webchat",
    name,
    webchat_public_key: publicKey,
    active: true,
    metadata: {
      webchat: {
        ...(title ? { title } : {}),
        ...(greeting ? { greeting } : {}),
        ...(launcher ? { launcher_text: launcher } : {}),
        color,
      },
    },
  });
  if (error) return { error: error.message };

  return { publicKey };
}

export default async function NewWebchatChannelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "xyra-chat.vercel.app";
  const appOrigin = `${proto}://${host}`;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Add a website chat widget</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A live chat bubble for your website — no Meta or external account
            needed. Messages land in your unified inbox; your bot can answer
            automatically.
          </p>
        </header>
        <NewWebchatChannelForm action={createWebchatChannelAction} appOrigin={appOrigin} />
      </div>
    </div>
  );
}
