"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertCanAddChannel } from "@/lib/billing/gates";
import { listMessengerPages, connectMessengerPage } from "@/lib/messenger/connect";

// Connects the Page the user picked in the chooser. Re-reads the short-lived
// user token from the httpOnly cookie set by the OAuth callback, re-lists the
// Pages to fetch the chosen Page's token, connects it, then clears the cookie.
export async function connectChosenMessengerPage(formData: FormData): Promise<void> {
  const pageId = String(formData.get("pageId") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jar = await cookies();
  const token = jar.get("msgr_oauth_token")?.value;
  if (!pageId || !token) {
    redirect("/settings/channels/messenger/new?reason=expired");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = profile?.org_id;
  if (!orgId) redirect(`/settings/channels?error=${encodeURIComponent("No organization.")}`);

  const gate = await assertCanAddChannel(orgId, "facebook");
  if (!gate.ok) redirect(`/settings/channels?error=${encodeURIComponent(gate.error)}`);

  const listed = await listMessengerPages(token);
  if (!listed.ok) redirect(`/settings/channels?error=${encodeURIComponent(listed.error)}`);
  const page = listed.pages.find((p) => p.id === pageId);
  if (!page) redirect(`/settings/channels?error=${encodeURIComponent("That Page wasn't found on your account.")}`);

  const r = await connectMessengerPage(orgId, user.id, page);
  jar.delete("msgr_oauth_token"); // clear the transient token regardless
  if (!r.ok) redirect(`/settings/channels?error=${encodeURIComponent(r.error)}`);
  redirect("/settings/channels?connected=messenger");
}
