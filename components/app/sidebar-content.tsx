import Link from "next/link";
import { XyraWordmark } from "@/components/brand/xyra-wordmark";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { SidebarUser } from "@/components/app/sidebar-user";

export function SidebarContent({
  fullName,
  email,
  avatarUrl,
}: {
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
}) {
  return (
    <div
      className="flex h-full w-full flex-col"
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
          fullName={fullName}
          email={email}
          avatarUrl={avatarUrl}
        />
      </div>
    </div>
  );
}
