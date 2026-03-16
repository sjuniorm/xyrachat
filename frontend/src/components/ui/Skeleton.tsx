import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded-md bg-surface-200', className)} />;
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('rounded-xl border border-surface-200 bg-white p-5 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function SkeletonRow({ className }: SkeletonProps) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border border-surface-200 bg-white p-4', className)}>
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
      <div className="border-b border-surface-100 p-4 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="border-b border-surface-50 p-4 flex gap-4 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonInbox() {
  return (
    <div className="flex h-full">
      <div className="w-80 border-r border-surface-200 p-3 space-y-2">
        <Skeleton className="h-9 w-full rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg p-3">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-36" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-surface-200 pb-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
        <div className="space-y-3 flex-1">
          <div className="flex justify-start"><Skeleton className="h-10 w-48 rounded-xl" /></div>
          <div className="flex justify-end"><Skeleton className="h-10 w-56 rounded-xl" /></div>
          <div className="flex justify-start"><Skeleton className="h-10 w-40 rounded-xl" /></div>
          <div className="flex justify-end"><Skeleton className="h-10 w-64 rounded-xl" /></div>
        </div>
      </div>
    </div>
  );
}
