"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { resetAnalytics } from "@/lib/analytics";

export function SidebarUser({
  fullName,
  email,
  avatarUrl,
}: {
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initials =
    (fullName ?? email ?? "?")
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  function signOut() {
    start(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      resetAnalytics();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm transition hover:bg-white/5"
        >
          <Avatar className="size-9 ring-1 ring-white/10">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback className="bg-[color:var(--xyra-purple)] text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white">
              {fullName ?? "Unnamed user"}
            </p>
            <p className="truncate text-xs text-white/60">{email ?? ""}</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem disabled className="text-xs">
          {email}
        </DropdownMenuItem>
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
