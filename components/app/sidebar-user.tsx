"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { resetAnalytics } from "@/lib/analytics";
import { setAvailability } from "@/lib/team/actions";
import type { Availability } from "@/lib/db-types";
import { cn } from "@/lib/utils";

const AVAIL: Record<
  Availability,
  { label: string; dot: string; ring: string }
> = {
  online: {
    label: "Online",
    dot: "bg-emerald-400",
    ring: "ring-emerald-400/40",
  },
  away: { label: "Away", dot: "bg-amber-400", ring: "ring-amber-400/40" },
  offline: { label: "Offline", dot: "bg-zinc-500", ring: "ring-zinc-500/40" },
};

export function SidebarUser({
  fullName,
  email,
  avatarUrl,
  initialAvailability = "online",
}: {
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  initialAvailability?: Availability;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [availability, setLocalAvailability] =
    useState<Availability>(initialAvailability);

  const initials =
    (fullName ?? email ?? "?")
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  function toggle(next: Availability) {
    if (next === availability) return;
    const prev = availability;
    setLocalAvailability(next); // optimistic
    start(async () => {
      const fd = new FormData();
      fd.set("availability", next);
      const r = await setAvailability(fd);
      if (!r.ok) {
        setLocalAvailability(prev);
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  function signOut() {
    start(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      resetAnalytics();
      router.push("/login");
      router.refresh();
    });
  }

  const avail = AVAIL[availability];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm transition hover:bg-white/5"
        >
          <div className="relative">
            <Avatar className="size-9 ring-1 ring-white/10">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
              <AvatarFallback className="bg-[color:var(--xyra-purple)] text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              aria-label={`availability: ${availability}`}
              className={cn(
                "absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-[color:var(--xyra-sidebar)]",
                avail.dot,
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white">
              {fullName ?? "Unnamed user"}
            </p>
            <p className="truncate text-xs text-white/60">
              <span className="inline-flex items-center gap-1">
                <span className={cn("inline-block size-1.5 rounded-full", avail.dot)} />
                {avail.label}
              </span>
            </p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem disabled className="text-xs">
          {email}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Availability</DropdownMenuLabel>
        {(Object.keys(AVAIL) as Availability[]).map((a) => (
          <DropdownMenuItem
            key={a}
            disabled={pending}
            onClick={() => toggle(a)}
            className="flex items-center gap-2"
          >
            <span
              className={cn(
                "inline-block size-2 shrink-0 rounded-full",
                AVAIL[a].dot,
              )}
            />
            <span className="flex-1">{AVAIL[a].label}</span>
            {availability === a && (
              <Check className="size-3.5 text-white/70" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={signOut}
            disabled={pending}
          >
            <LogOut className="mr-2 size-4" />
            {pending ? "Signing out…" : "Sign out"}
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
