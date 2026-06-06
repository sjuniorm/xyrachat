"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

// Error boundary for the whole dashboard segment — renders inside the dashboard
// layout (sidebar stays), so a failed page doesn't blank the app. Reports to
// Sentry + offers a retry.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
        <p className="mt-2 text-sm text-white/60">
          This part of the app hit an error. Try again — if it keeps happening,
          our team has already been notified.
        </p>
        <Button
          onClick={() => reset()}
          className="mt-5 xyra-gradient border-0 text-white hover:opacity-90"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
