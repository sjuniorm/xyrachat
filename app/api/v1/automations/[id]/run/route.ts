import { type NextRequest } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, invalidRequest, unprocessable } from "@/lib/api/errors";
import { executeAutomation } from "@/lib/automations/executor";
import type { AutomationRow } from "@/lib/automations/types";

export const runtime = "nodejs";

// POST /api/v1/automations/:id/run
// body: { contact_id: string, trigger_data?: Record<string, unknown> }
//
// Fires an automation manually for a specific contact. Useful for
// connector flows that want to run an existing Xyra flow as one of
// their action steps. Trigger type doesn't matter — we just execute
// the action array directly.
export const POST = apiHandler({
  scopes: ["automations:write"],
  handler: async (req: NextRequest, ctx, params) => {
    let body: { contact_id?: string; trigger_data?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return invalidRequest("invalid_json", "Request body must be valid JSON.");
    }
    if (!body.contact_id) {
      return invalidRequest("missing_field", "contact_id required.", "contact_id");
    }
    const admin = createAdminClient();
    const [{ data: automation }, { data: contact }] = await Promise.all([
      admin.from("automations").select("*").eq("id", params.id).is("deleted_at", null).maybeSingle(),
      admin
        .from("contacts")
        .select("id, org_id, name, phone, email, instagram_id, telegram_id, messenger_id")
        .eq("id", body.contact_id)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
    if (!automation || automation.org_id !== ctx.orgId) return notFound("Automation not found.");
    if (!contact || contact.org_id !== ctx.orgId) return notFound("Contact not found.");
    if (!automation.channel_id) {
      return unprocessable("no_channel", "Automation has no channel.");
    }
    const { data: channel } = await admin
      .from("channels")
      .select("id, type, org_id, phone_number_id, page_id, ig_business_account_id, access_token_vault_id, metadata")
      .eq("id", automation.channel_id)
      .maybeSingle();
    if (!channel) return unprocessable("channel_missing", "Automation's channel is gone.");
    const result = await executeAutomation({
      automation: automation as AutomationRow,
      contact,
      channel,
      triggerData: body.trigger_data ?? { source: "api" },
    });
    return {
      object: "automation_run",
      automation_id: automation.id,
      contact_id: contact.id,
      status: result.status,
      steps: result.steps,
      error_message: result.error_message,
    };
  },
});
