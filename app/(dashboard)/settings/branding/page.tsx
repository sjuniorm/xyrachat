import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasFeature } from "@/lib/billing/entitlements";
import { getStoredBranding } from "@/lib/branding/server";
import { BrandingForm } from "./branding-form";

export const dynamic = "force-dynamic";

export default async function BrandingSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me?.org_id) redirect("/onboarding");
  const canManage = me.role === "owner" || me.role === "admin";

  const [whitelabel, branding] = await Promise.all([
    hasFeature(me.org_id, "feature:whitelabel"),
    getStoredBranding(me.org_id),
  ]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Branding</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            White-label Xyra with your own brand in customer-facing surfaces.
          </p>
        </header>

        {!whitelabel && (
          <div className="flex items-start gap-2 rounded-md border border-[color:var(--xyra-purple)]/30 bg-[color:var(--xyra-purple)]/10 px-3 py-2.5 text-sm text-white/80">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-[color:var(--xyra-glow)]" />
            <span>
              White-label is available on higher plans. You can configure it now, but it
              only applies to your customers once enabled —{" "}
              <Link href="/settings/billing" className="underline">see plans</Link>.
            </span>
          </div>
        )}

        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Your brand</CardTitle>
            <CardDescription>
              {whitelabel
                ? "Live for your customers (currently applied to the web-chat widget)."
                : "Saved now; applies automatically when white-label is enabled."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canManage ? (
              <BrandingForm initial={branding} />
            ) : (
              <p className="text-sm text-white/50">Only owners and admins can edit branding.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
