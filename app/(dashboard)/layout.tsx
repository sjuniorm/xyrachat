import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SidebarContent } from "@/components/app/sidebar-content";
import { MobileHeader } from "@/components/app/mobile-header";

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
    .select("full_name, email, avatar_url, org_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.org_id) redirect("/onboarding");

  const userProps = {
    fullName: profile.full_name ?? null,
    email: profile.email ?? user.email ?? null,
    avatarUrl: profile.avatar_url ?? null,
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
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
