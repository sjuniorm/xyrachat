"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Records why a customer is cancelling (or that they stayed). Pure
// analytics — the actual cancellation happens in the Stripe Portal.
// Any org member can log their own org's feedback (RLS insert policy
// in migration 027 enforces org scope).
export async function recordCancellationFeedback(input: {
  reason: string;
  reasonDetail?: string;
  proceeded: boolean; // true = went to portal, false = pressed "keep"
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return { ok: false, error: "No org." };
  if (!input.reason?.trim()) return { ok: false, error: "Pick a reason." };

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan")
    .eq("org_id", profile.org_id)
    .maybeSingle();

  const { error } = await admin.from("cancellation_feedback").insert({
    org_id: profile.org_id,
    user_id: user.id,
    plan_at_cancel: sub?.plan ?? null,
    reason: input.reason.trim(),
    reason_detail: input.reasonDetail?.trim() || null,
    canceled: input.proceeded,
    retained: !input.proceeded,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
