"use client";

import Link from "next/link";
import { Plus, Camera, MessageCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AddChannelButton({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={
            size === "lg"
              ? "xyra-gradient text-white border-0 hover:opacity-90"
              : "xyra-gradient text-white border-0 hover:opacity-90"
          }
        >
          <Plus className="mr-1.5 size-4" />
          Add channel
          <ChevronDown className="ml-1 size-3.5 opacity-80" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/settings/channels/new" className="cursor-pointer">
            <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-[#25D366]">
              <MessageCircle className="size-3 text-white" />
            </span>
            WhatsApp Business
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/channels/instagram/new" className="cursor-pointer">
            <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-[linear-gradient(135deg,#833AB4_0%,#FD1D1D_50%,#FCB045_100%)]">
              <Camera className="size-3 text-white" />
            </span>
            Instagram DM
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
