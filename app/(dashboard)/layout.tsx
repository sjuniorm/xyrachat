import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { XyraWordmark } from "@/components/brand/xyra-wordmark";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { SidebarUser } from "@/components/app/sidebar-user";

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

  return (
    <div className="flex min-h-screen w-full">
      {/* Sidebar */}
      <aside
        className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-white/5 md:flex"
        style={{ background: "var(--xyra-sidebar)" }}
      >
        <div className="flex h-16 items-center px-5">
          <Link href="/dashboard" className="inline-flex">
            <XyraWordmark size="md" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav />
        </div>
        <div className="border-t border-white/5 p-3">
          <SidebarUser
            fullName={profile.full_name ?? null}
            email={profile.email ?? user.email ?? null}
            avatarUrl={profile.avatar_url ?? null}
          />
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-h-screen flex-1 flex-col">{children}</main>
    </div>
  );
}
