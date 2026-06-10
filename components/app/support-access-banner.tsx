import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getActiveSupportGrant } from "@/lib/support/access";

// Persistent (non-dismissible) transparency bar shown to EVERY member while a
// support grant is live — a workspace should never be quietly accessible.
// Renders nothing when there's no active grant (the common case).
export async function SupportAccessBanner({ orgId }: { orgId: string }) {
  const grant = await getActiveSupportGrant(orgId);
  if (!grant) return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-100">
      <ShieldAlert className="size-3.5 shrink-0" />
      <span className="flex-1" suppressHydrationWarning>
        Xyra Support can access this workspace until{" "}
        {new Date(grant.expires_at).toLocaleString()} (
        {grant.scope === "read_only" ? "view-only" : "view & reply"}).
      </span>
      <Link
        href="/settings/team"
        className="shrink-0 font-medium underline hover:text-white"
      >
        Manage
      </Link>
    </div>
  );
}
