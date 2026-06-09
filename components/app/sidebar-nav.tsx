"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  Users,
  Megaphone,
  Bot,
  Settings,
  Sparkles,
  FileText,
  Plug,
  MessagesSquare,
  LifeBuoy,
  Rocket,
  Lightbulb,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LATEST_VERSION } from "@/lib/changelog";

type NavItem = { href: string; label: string; icon: LucideIcon };

const ITEMS: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/bots", label: "Bots", icon: Bot },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/broadcasts", label: "Broadcasts", icon: Megaphone },
  { href: "/automations", label: "Automations", icon: Sparkles },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/team-chat", label: "Team chat", icon: MessagesSquare },
  { href: "/changelog", label: "What's new", icon: Rocket },
  { href: "/roadmap", label: "Roadmap", icon: Lightbulb },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: LifeBuoy },
];

const SEEN_KEY = "xyra:changelog:lastSeen";

export function SidebarNav({ isOperator = false }: { isOperator?: boolean }) {
  const pathname = usePathname();
  const items = isOperator
    ? [...ITEMS, { href: "/settings/admin", label: "Operator", icon: ShieldCheck }]
    : ITEMS;
  // Unseen-release dot on "What's new". Defaults false so SSR + first client
  // render match (localStorage isn't available on the server); the effect
  // reconciles after mount. Viewing /changelog marks the latest version seen.
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    try {
      const onChangelog =
        pathname === "/changelog" || pathname.startsWith("/changelog/");
      if (onChangelog) {
        localStorage.setItem(SEEN_KEY, LATEST_VERSION);
        setUnseen(false);
      } else {
        setUnseen(localStorage.getItem(SEEN_KEY) !== LATEST_VERSION);
      }
    } catch {
      // Private mode / blocked storage: just don't show the dot.
    }
  }, [pathname]);

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const showDot = href === "/changelog" && unseen && !active;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                : "text-white/70 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span>{label}</span>
            {showDot && (
              <>
                <span className="sr-only">(new updates)</span>
                <span
                  className="ml-auto size-2 rounded-full bg-[color:var(--xyra-glow)] shadow-[0_0_8px_var(--xyra-glow)]"
                  aria-hidden
                />
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
