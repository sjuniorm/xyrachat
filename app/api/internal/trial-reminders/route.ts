import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTrialEndingEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST/GET /api/internal/trial-reminders — CRON_SECRET-authed. Finds
// app-managed trials ending within 3 days that haven't been reminded yet and
// emails the workspace owner a branded "your trial ends in N days" nudge.
// Called daily by pg_cron (trigger_trial_reminders, migration 044).
//
// De-duped via subscriptions.trial_reminder_sent_at (set only on a successful
// send), so a transient email failure / un-configured Resend domain retries the
// next day rather than silently dropping the reminder.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const in3d = new Date(now + 3 * 86_400_000).toISOString();
  const { data: due } = await admin
    .from("subscriptions")
    .select("org_id, trial_ends_at")
    .not("trial_ends_at", "is", null)
    .gt("trial_ends_at", new Date(now).toISOString())
    .lte("trial_ends_at", in3d)
    .is("trial_reminder_sent_at", null)
    .is("stripe_subscription_id", null)
    .neq("status", "canceled")
    .limit(200);

  let sent = 0;
  for (const row of due ?? []) {
    const orgId = row.org_id as string;
    const trialEnds = row.trial_ends_at as string;
    const daysLeft = Math.max(
      1,
      Math.ceil((new Date(trialEnds).getTime() - now) / 86_400_000),
    );

    const [{ data: org }, { data: owner }] = await Promise.all([
      admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      admin
        .from("profiles")
        .select("email")
        .eq("org_id", orgId)
        .eq("role", "owner")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
    ]);
    if (!owner?.email) continue;

    const res = await sendTrialEndingEmail(owner.email, org?.name ?? "your workspace", daysLeft);
    if (res.ok) {
      await admin
        .from("subscriptions")
        .update({ trial_reminder_sent_at: new Date().toISOString() })
        .eq("org_id", orgId);
      sent++;
    }
  }

  return NextResponse.json({ ok: true, reminders_sent: sent });
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}
