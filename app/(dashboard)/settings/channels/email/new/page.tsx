import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertCanAddChannel } from "@/lib/billing/gates";
import { NewEmailChannelForm } from "./new-email-channel-form";

async function createEmailChannelAction(
  formData: FormData,
): Promise<{ error?: string }> {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const fromName = String(formData.get("from_name") ?? "").trim();
  const inboxLocal = String(formData.get("inbox_local") ?? "").trim().toLowerCase();
  if (!name) return { error: "Channel name is required." };
  if (!inboxLocal || !/^[a-z0-9._-]+$/.test(inboxLocal)) {
    return { error: "Inbox prefix must be a-z, 0-9, dot, dash, or underscore." };
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

  const gate = await assertCanAddChannel(orgId, "email");
  if (!gate.ok) return { error: gate.error };

  const domain = process.env.INBOUND_EMAIL_DOMAIN ?? "mail.xyrachat.com";
  const inboxEmail = `${inboxLocal}@${domain}`.toLowerCase();

  const admin = createAdminClient();
  const { error: insertErr } = await admin.from("channels").insert({
    org_id: orgId,
    type: "email",
    name,
    inbox_email: inboxEmail,
    active: true,
    metadata: fromName ? { from_name: fromName } : {},
  });
  if (insertErr) {
    // Unique-violation on inbox_email => helpful error.
    if (insertErr.code === "23505") {
      return { error: `That inbox prefix is already taken. Try a different one.` };
    }
    return { error: insertErr.message };
  }

  redirect("/settings/channels?connected=email");
}

export default async function NewEmailChannelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  // Read the org's slug for the default inbox prefix suggestion.
  const { data: org } = await supabase
    .from("organizations")
    .select("slug, name")
    .eq("id", profile.org_id)
    .maybeSingle();

  const domain = process.env.INBOUND_EMAIL_DOMAIN ?? "mail.xyrachat.com";
  const resendConfigured = Boolean(process.env.RESEND_API_KEY);
  const suggestedLocal = org?.slug ?? "support";

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Connect email
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Get a dedicated inbox address — emails sent here land in Xyra. Use
            it directly with customers, or set up forwarding from your
            existing support@ address.
          </p>
        </header>

        <NewEmailChannelForm
          action={createEmailChannelAction}
          domain={domain}
          suggestedLocal={suggestedLocal}
          resendConfigured={resendConfigured}
        />
      </div>
    </div>
  );
}
