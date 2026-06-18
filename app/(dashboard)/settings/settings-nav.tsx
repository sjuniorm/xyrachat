"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/channels", label: "Channels" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/calendar", label: "Calendar" },
  { href: "/settings/crm", label: "CRM" },
  { href: "/settings/inbox", label: "Inbox" },
  { href: "/settings/api", label: "API & Webhooks" },
  { href: "/settings/billing", label: "Plan & Usage" },
] as const;

export function SettingsNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="ml-auto flex items-center gap-1">
      {TABS.map((t) => {
        const active =
          pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition",
              active
                ? "bg-white/10 text-white"
                : "text-white/60 hover:bg-white/5 hover:text-white",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
