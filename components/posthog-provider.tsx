"use client";

import { useEffect } from "react";
import { initPostHogBrowser } from "@/lib/analytics";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHogBrowser();
  }, []);
  return <>{children}</>;
}
