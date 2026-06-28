"use client";

import { useEffect } from "react";

// Auto-recover from stale-chunk errors after a deploy. When a hashed JS/CSS
// chunk fails to load — classic when a user has an old tab open and a new
// version ships, so the old chunk 404s — Next.js throws a chunk-load error and
// the route silently fails to render. We reload the page once to pull the fresh
// build.
//
// IMPORTANT: we match ONLY chunk/module-load failures, never generic
// "Load failed" / "Failed to fetch" (those fire for any failed fetch — analytics,
// API calls — and must NOT trigger a reload). A sessionStorage stamp prevents a
// reload loop if the failure is genuinely persistent.
export function ChunkReloader() {
  useEffect(() => {
    const KEY = "xyra_chunk_reloaded_at";
    const isChunkLoadError = (msg?: string | null) =>
      !!msg &&
      /Loading chunk \d+ failed|Loading CSS chunk|ChunkLoadError|error loading dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
        msg,
      );

    const recover = (msg?: string | null) => {
      if (!isChunkLoadError(msg)) return;
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      // At most one reload per 10s — if a fresh build still can't load the chunk,
      // don't loop; let the real error surface.
      if (Date.now() - last < 10_000) return;
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    };

    const onError = (e: ErrorEvent) =>
      recover(e.message || (e.error as Error | undefined)?.message);
    const onRejection = (e: PromiseRejectionEvent) =>
      recover(typeof e.reason === "string" ? e.reason : (e.reason as Error | undefined)?.message);

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
