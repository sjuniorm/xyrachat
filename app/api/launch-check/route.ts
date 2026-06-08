import { NextResponse, type NextRequest } from "next/server";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// GET /api/launch-check — OWNER-gated launch-readiness diagnostic. Reports which
// config groups are wired (env PRESENCE only — never values) + a live Supabase
// probe, so the operator can see what's left before flipping the launch switch.
// Reveals config state, so it's owner-only and exposes booleans, not secrets.

type Check = { name: string; ok: boolean; required: boolean; note?: string };

function has(name: string): boolean {
  return Boolean(process.env[name] && process.env[name]!.length > 0);
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "owner") {
    return NextResponse.json({ error: "Owners only" }, { status: 403 });
  }

  // Live Supabase probe (admin) — confirms the service role + DB are reachable.
  let supabaseOk = false;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("organizations").select("id", { head: true, count: "exact" });
    supabaseOk = !error;
  } catch {
    supabaseOk = false;
  }

  const groups: Record<string, Check[]> = {
    core: [
      { name: "NEXT_PUBLIC_SUPABASE_URL", ok: has("NEXT_PUBLIC_SUPABASE_URL"), required: true },
      { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", ok: has("NEXT_PUBLIC_SUPABASE_ANON_KEY"), required: true },
      { name: "SUPABASE_SERVICE_ROLE_KEY", ok: has("SUPABASE_SERVICE_ROLE_KEY"), required: true },
      { name: "Supabase reachable", ok: supabaseOk, required: true, note: "live DB probe" },
      { name: "APP_PEPPER", ok: has("APP_PEPPER"), required: true, note: "API-key hashing" },
      { name: "CRON_SECRET", ok: has("CRON_SECRET"), required: true, note: "cron + internal jobs" },
      { name: "NEXT_PUBLIC_APP_URL", ok: has("NEXT_PUBLIC_APP_URL"), required: false },
    ],
    ai: [
      { name: "ANTHROPIC_API_KEY", ok: has("ANTHROPIC_API_KEY"), required: true, note: "bot replies" },
      { name: "OPENAI_API_KEY", ok: has("OPENAI_API_KEY"), required: true, note: "embeddings + Whisper" },
    ],
    payments: [
      { name: "STRIPE_SECRET_KEY", ok: has("STRIPE_SECRET_KEY"), required: true },
      { name: "STRIPE_WEBHOOK_SECRET", ok: has("STRIPE_WEBHOOK_SECRET"), required: true },
      { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", ok: has("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"), required: true },
      { name: "STRIPE_PRICE_STARTER_MONTHLY", ok: has("STRIPE_PRICE_STARTER_MONTHLY"), required: true },
      { name: "STRIPE_PRICE_PRO_MONTHLY", ok: has("STRIPE_PRICE_PRO_MONTHLY"), required: true },
      { name: "STRIPE_PRICE_ENTERPRISE_MONTHLY", ok: has("STRIPE_PRICE_ENTERPRISE_MONTHLY"), required: true },
    ],
    channels: [
      { name: "META_APP_SECRET", ok: has("META_APP_SECRET"), required: true, note: "WhatsApp webhook HMAC" },
      { name: "WHATSAPP_WEBHOOK_VERIFY_TOKEN", ok: has("WHATSAPP_WEBHOOK_VERIFY_TOKEN"), required: true },
      { name: "INSTAGRAM_APP_SECRET", ok: has("INSTAGRAM_APP_SECRET"), required: false, note: "IG webhook + OAuth" },
      { name: "INSTAGRAM_WEBHOOK_VERIFY_TOKEN", ok: has("INSTAGRAM_WEBHOOK_VERIFY_TOKEN"), required: false },
    ],
    email: [
      { name: "RESEND_API_KEY", ok: has("RESEND_API_KEY"), required: true },
      { name: "RESEND_WEBHOOK_SECRET", ok: has("RESEND_WEBHOOK_SECRET"), required: false, note: "inbound email" },
      { name: "INBOUND_EMAIL_DOMAIN", ok: has("INBOUND_EMAIL_DOMAIN"), required: false },
      { name: "EMAIL_FROM_ADDRESS", ok: has("EMAIL_FROM_ADDRESS"), required: false },
    ],
    observability: [
      { name: "NEXT_PUBLIC_SENTRY_DSN", ok: has("NEXT_PUBLIC_SENTRY_DSN"), required: false, note: "error tracking" },
      { name: "NEXT_PUBLIC_POSTHOG_KEY", ok: has("NEXT_PUBLIC_POSTHOG_KEY"), required: false, note: "analytics" },
      { name: "UPSTASH_REDIS_REST_URL", ok: has("UPSTASH_REDIS_REST_URL"), required: false, note: "rate limiting (fails open until set)" },
      { name: "UPSTASH_REDIS_REST_TOKEN", ok: has("UPSTASH_REDIS_REST_TOKEN"), required: false },
    ],
  };

  const all = Object.values(groups).flat();
  const missingRequired = all.filter((c) => c.required && !c.ok).map((c) => c.name);

  return NextResponse.json({
    ready: missingRequired.length === 0,
    missing_required: missingRequired,
    checked_at: new Date().toISOString(),
    groups,
    notes: [
      "Env checks report PRESENCE only, never values.",
      "Not auto-checked (verify manually): RLS on all tables (✓ audited), Meta/Stripe webhook endpoints registered in their dashboards, domain SSL, Expo push (needs eas projectId).",
    ],
  });
}
