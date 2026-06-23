import Link from "next/link";
import { XyraWordmark } from "@/components/brand/xyra-wordmark";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { SidebarUser } from "@/components/app/sidebar-user";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import type { Availability } from "@/lib/db-types";

export function SidebarContent({
  fullName,
  email,
  avatarUrl,
  availability,
  isOperator = false,
  inboxEnabled = true,
}: {
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  availability?: Availability;
  isOperator?: boolean;
  inboxEnabled?: boolean;
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
      <WorkspaceSwitcher />
      <div className="flex-1 overflow-y-auto py-4">
        <SidebarNav isOperator={isOperator} inboxEnabled={inboxEnabled} />
      </div>
      <div className="border-t border-white/5 p-3">
        <SidebarUser
          fullName={fullName}
          email={email}
          avatarUrl={avatarUrl}
          initialAvailability={availability ?? "online"}
        />
      </div>
    </div>
  );
}
