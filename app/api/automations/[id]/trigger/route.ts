import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeAutomation } from "@/lib/automations/executor";
import type { AutomationRow, TriggerConfig } from "@/lib/automations/types";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// POST /api/automations/:id/trigger
//
// The inbound endpoint for the "External webhook" automation trigger. An
// external system (a form, a no-code tool, a backend) POSTs here to fire the
// automation. Auth is a per-automation shared secret (generated at creation,
// shown on the automation page) sent as the `X-Xyra-Secret` header OR a
// `secret` field in the JSON body — never in the URL (query strings leak to logs).
//
// Body identifies the contact to run the flow for — either an existing
// `contact_id`, or contact fields to find-or-create:
//   { contact_id }  OR  { phone | email | instagram_id | telegram_id, name? }
// plus an optional `data` object merged into the template variables.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Cheap per-IP throttle (public endpoint). Fails open until Upstash is set.
  const rl = await rateLimit("automation:trigger", `${id}:${clientIp(req)}`, { limit: 60, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "Slow down" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  const admin = createAdminClient();
  const { data: automation } = await admin
    .from("automations")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!automation) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (automation.trigger_type !== "webhook") {
    return NextResponse.json({ ok: false, error: "Automation is not webhook-triggered" }, { status: 400 });
  }
  if (!automation.active) {
    return NextResponse.json({ ok: false, error: "Automation is inactive" }, { status: 409 });
  }

  let body: {
    secret?: string;
    contact_id?: string;
    phone?: string;
    email?: string;
    instagram_id?: string;
    telegram_id?: string;
    name?: string;
    data?: Record<string, unknown>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  // Authenticate the shared secret (constant-time). Accept it from the
  // X-Xyra-Secret header OR the JSON body — NEVER from the URL query string
  // (query params leak into server/proxy/access logs and browser history).
  const provided = req.headers.get("x-xyra-secret") ?? body.secret ?? "";
  const expected = (automation.trigger_config as TriggerConfig | null)?.webhook_secret ?? "";
  if (!expected || !secretMatches(provided, expected)) {
    return NextResponse.json({ ok: false, error: "Invalid secret" }, { status: 401 });
  }

  // Resolve the contact — existing id, or find-or-create by an identifier.
  const contact = await resolveContact(admin, automation.org_id, body);
  if (!contact) {
    return NextResponse.json(
      { ok: false, error: "Provide contact_id or a contact identifier (phone/email/instagram_id/telegram_id)." },
      { status: 400 },
    );
  }

  if (!automation.channel_id) {
    return NextResponse.json({ ok: false, error: "Automation has no channel" }, { status: 409 });
  }
  const { data: channel } = await admin
    .from("channels")
    .select("id, type, org_id, phone_number_id, page_id, ig_business_account_id, access_token_vault_id, metadata")
    .eq("id", automation.channel_id)
    .maybeSingle();
  if (!channel) return NextResponse.json({ ok: false, error: "Channel missing" }, { status: 409 });

  const result = await executeAutomation({
    automation: automation as AutomationRow,
    contact,
    channel,
    triggerData: { source: "webhook", ...(body.data ?? {}) },
  });

  return NextResponse.json({
    ok: true,
    status: result.status,
    steps: result.steps,
    error_message: result.error_message,
  });
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function resolveContact(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  body: { contact_id?: string; phone?: string; email?: string; instagram_id?: string; telegram_id?: string; name?: string },
) {
  const COLS = "id, org_id, name, phone, email, instagram_id, telegram_id, messenger_id";
  if (body.contact_id) {
    const { data } = await admin
      .from("contacts")
      .select(COLS)
      .eq("id", body.contact_id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    return data ?? null;
  }
  // Find-or-create by the first provided identifier.
  const ident: Array<["phone" | "email" | "instagram_id" | "telegram_id", string]> = [];
  if (body.phone) ident.push(["phone", body.phone]);
  if (body.email) ident.push(["email", body.email.toLowerCase()]);
  if (body.instagram_id) ident.push(["instagram_id", body.instagram_id]);
  if (body.telegram_id) ident.push(["telegram_id", body.telegram_id]);
  if (ident.length === 0) return null;
  const [col, val] = ident[0];
  const { data: existing } = await admin
    .from("contacts")
    .select(COLS)
    .eq("org_id", orgId)
    .eq(col, val)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return existing;
  const { data: created } = await admin
    .from("contacts")
    .insert({ org_id: orgId, name: body.name ?? null, [col]: val })
    .select(COLS)
    .single();
  return created ?? null;
}
