import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMessengerPages } from "@/lib/messenger/connect";
import { connectChosenMessengerPage } from "./actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChannelIcon } from "@/components/ui/channel-icon";

// Multi-Page chooser for the redirect-based Messenger connect. The OAuth
// callback lands here (with a short-lived user token in an httpOnly cookie) when
// the account manages more than one Facebook Page, so the user explicitly picks
// which to connect — surfacing pages_show_list rather than silently auto-picking.
export default async function SelectMessengerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const token = (await cookies()).get("msgr_oauth_token")?.value;
  if (!token) redirect("/settings/channels/messenger/new?reason=expired");

  const listed = await listMessengerPages(token);
  if (!listed.ok) {
    redirect(`/settings/channels?error=${encodeURIComponent(listed.error)}`);
  }
  if (listed.pages.length === 0) {
    redirect(`/settings/channels?error=${encodeURIComponent("No Facebook Pages found on this account.")}`);
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Choose a Facebook Page</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick which of your Pages to connect as a Messenger channel.
          </p>
        </header>
        <ul className="space-y-3">
          {listed.pages.map((p) => (
            <li key={p.id}>
              <Card className="border-white/10 bg-card/60">
                <CardContent className="flex items-center gap-4 py-4">
                  <ChannelIcon channel="facebook" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{p.name}</p>
                    <p className="text-xs text-muted-foreground">Page ID {p.id}</p>
                  </div>
                  <form action={connectChosenMessengerPage}>
                    <input type="hidden" name="pageId" value={p.id} />
                    <Button
                      type="submit"
                      className="xyra-gradient border-0 text-white hover:opacity-90"
                    >
                      Connect
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
