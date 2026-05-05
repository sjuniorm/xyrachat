"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "xyra.cookie-consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY)) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  function decide(value: "accepted" | "rejected") {
    window.localStorage.setItem(STORAGE_KEY, value);
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[color:var(--xyra-sidebar)]/95 p-5 shadow-2xl backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-white/80">
          We use cookies to keep you signed in and to measure product usage.
          Read our{" "}
          <Link href="/privacy" className="underline hover:text-white">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="text-white/80 hover:text-white"
            onClick={() => decide("rejected")}
          >
            Reject
          </Button>
          <Button
            className="xyra-gradient text-white border-0 hover:opacity-90"
            onClick={() => decide("accepted")}
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
