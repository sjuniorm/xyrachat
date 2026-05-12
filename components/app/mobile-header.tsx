"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { XyraWordmark } from "@/components/brand/xyra-wordmark";
import { SidebarContent } from "@/components/app/sidebar-content";
import type { Availability } from "@/lib/db-types";

export function MobileHeader({
  fullName,
  email,
  avatarUrl,
  availability,
}: {
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  availability?: Availability;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/5 px-3 md:hidden"
      style={{ background: "var(--xyra-sidebar)" }}
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/80 hover:text-white hover:bg-white/10"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[280px] border-white/5 p-0"
          style={{ background: "var(--xyra-sidebar)" }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div onClick={() => setOpen(false)}>
            <SidebarContent
              fullName={fullName}
              email={email}
              avatarUrl={avatarUrl}
              availability={availability}
            />
          </div>
        </SheetContent>
      </Sheet>
      <XyraWordmark size="sm" />
    </header>
  );
}
