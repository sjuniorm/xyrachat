import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, BarChart3, Ticket, ShieldAlert, RotateCcw, SlidersHorizontal, Bug } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isOperatorProfile } from "@/lib/admin/operator";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const TOOLS = [
  { href: "/settings/admin/clients", icon: Users, title: "Clients", blurb: "All organizations — stats, plan, trial, permissions, actions." },
  { href: "/settings/admin/metrics", icon: BarChart3, title: "Business metrics", blurb: "Platform-wide counts: orgs, conversations, messages, AI usage." },
  { href: "/settings/admin/entitlements", icon: SlidersHorizontal, title: "Entitlements", blurb: "Provision bundles + grant/revoke features per org. Launch backfill." },
  { href: "/settings/admin/promos", icon: Ticket, title: "Promo codes", blurb: "Create + manage discount / free-month / trial codes." },
  { href: "/settings/admin/disputes", icon: ShieldAlert, title: "Disputes", blurb: "Stripe chargebacks — evidence + status." },
  { href: "/settings/admin/restore", icon: RotateCcw, title: "Restore", blurb: "Recover soft-deleted workspaces / conversations / contacts." },
];

export default async function AdminHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");
  if (!isOperatorProfile(profile.role, profile.org_id)) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <p className="text-sm text-white/60">This console is for Xyra Chat operators only.</p>
      </div>
    );
  }

  const sentry = process.env.NEXT_PUBLIC_SENTRY_DSN ? "https://sentry.io" : null;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Operator console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage every client organization, billing, and platform health.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href}>
              <Card className="h-full border-white/10 bg-card/60 transition hover:border-[color:var(--xyra-purple)]/40 hover:bg-white/5">
                <CardContent className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--xyra-purple)]/15 text-[color:var(--xyra-glow)]">
                    <t.icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{t.title}</p>
                    <p className="mt-0.5 text-xs text-white/50">{t.blurb}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          <a href={sentry ?? "https://sentry.io"} target="_blank" rel="noreferrer">
            <Card className="h-full border-white/10 bg-card/60 transition hover:border-[color:var(--xyra-purple)]/40 hover:bg-white/5">
              <CardContent className="flex items-start gap-3 p-4">
                <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300">
                  <Bug className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">Errors &amp; logs ↗</p>
                  <p className="mt-0.5 text-xs text-white/50">
                    {sentry ? "Open Sentry" : "Set NEXT_PUBLIC_SENTRY_DSN to enable Sentry"} · PostHog
                    for product analytics. Recent failed API calls surface on each client.
                  </p>
                </div>
              </CardContent>
            </Card>
          </a>
        </div>
      </div>
    </div>
  );
}
