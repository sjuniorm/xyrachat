import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOperatorProfile } from "@/lib/admin/operator";
import { SidebarContent } from "@/components/app/sidebar-content";
import { MobileHeader } from "@/components/app/mobile-header";
import { BillingBanner } from "@/components/app/billing-banner";
import { SupportAccessBanner } from "@/components/app/support-access-banner";
import { HelpWidget } from "@/components/app/help-widget";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, avatar_url, org_id, availability, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.org_id) redirect("/onboarding");

  const isOperator = isOperatorProfile(profile.role, profile.org_id);
  const userProps = {
    fullName: profile.full_name ?? null,
    email: profile.email ?? user.email ?? null,
    avatarUrl: profile.avatar_url ?? null,
    availability: (profile.availability as
      | "online"
      | "away"
      | "offline"
      | null) ?? "online",
    isOperator,
  };

  return (
    <div className="flex h-dvh w-full">
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden h-full w-[260px] shrink-0 border-r border-white/5 md:block">
        <SidebarContent {...userProps} />
      </aside>

      {/* Mobile column: hamburger header + content */}
      <div className="flex h-full flex-1 flex-col">
        <MobileHeader {...userProps} />
        <SupportAccessBanner orgId={profile.org_id} />
        <BillingBanner orgId={profile.org_id} />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
      <HelpWidget />
    </div>
  );
}
