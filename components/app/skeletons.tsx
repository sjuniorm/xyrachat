// Reusable loading skeletons for route-level loading.tsx files. Pure markup
// (server-safe) built on the shadcn Skeleton primitive. These show during
// navigation/Suspense while a route's server data resolves — perceived-perf
// only, no behavior change.

import { Skeleton } from "@/components/ui/skeleton";

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-5xl">{children}</div>
    </div>
  );
}

function HeaderBlock() {
  return (
    <div className="mb-8 space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

export function CardGridSkeleton() {
  return (
    <PageShell>
      <HeaderBlock />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </PageShell>
  );
}

export function ListSkeleton() {
  return (
    <PageShell>
      <HeaderBlock />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    </PageShell>
  );
}

export function DetailSkeleton() {
  return (
    <PageShell>
      <Skeleton className="mb-4 h-4 w-24" />
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-44" />
      </div>
      <Skeleton className="mb-6 h-10 w-full rounded-lg" />
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </PageShell>
  );
}

export function FormSkeleton() {
  return (
    <PageShell>
      <HeaderBlock />
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-white/10 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ))}
      </div>
    </PageShell>
  );
}

// Inbox conversation thread (the right pane of /inbox/[id]). Mirrors the
// MessageThread chrome: top bar, alternating bubbles, composer.
export function ThreadSkeleton() {
  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 px-4">
          <Skeleton className="size-8 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div
          className="flex-1 space-y-3 overflow-hidden px-6 py-4"
          style={{ background: "color-mix(in oklab, var(--xyra-bg) 92%, black)" }}
        >
          <Skeleton className="h-10 w-48 rounded-2xl" />
          <Skeleton className="ml-auto h-10 w-56 rounded-2xl" />
          <Skeleton className="h-16 w-64 rounded-2xl" />
          <Skeleton className="ml-auto h-12 w-44 rounded-2xl" />
          <Skeleton className="h-10 w-52 rounded-2xl" />
        </div>
        <div className="border-t border-white/5 p-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
