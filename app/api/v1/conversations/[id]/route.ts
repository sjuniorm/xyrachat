import { NextResponse, type NextRequest } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, invalidRequest } from "@/lib/api/errors";
import { shapeConversation } from "@/lib/api/shapes";
import { emit } from "@/lib/api/emit";
import { maybeSendSurvey } from "@/lib/surveys/server";

export const runtime = "nodejs";

const CONV_COLS =
  "id, channel_id, contact_id, assigned_to, status, last_message_at, last_inbound_at, snooze_until, created_at, org_id";

export const GET = apiHandler({
  scopes: ["conversations:read"],
  handler: async (_req, ctx, params) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("conversations")
      .select(CONV_COLS)
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data || data.org_id !== ctx.orgId) return notFound("Conversation not found.");
    return shapeConversation(data);
  },
});

// PATCH /api/v1/conversations/:id — partial update of status / assigned_to / snooze_until.
export const PATCH = apiHandler({
  scopes: ["conversations:write"],
  handler: async (req: NextRequest, ctx, params) => {
    let body: {
      status?: "open" | "closed" | "snoozed" | "bot";
      assigned_to?: string | null;
      snooze_until?: string | null;
    };
    try {
      body = await req.json();
    } catch {
      return invalidRequest("invalid_json", "Request body must be valid JSON.");
    }
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("conversations")
      .select("id, org_id, status, assigned_to")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing || existing.org_id !== ctx.orgId) {
      return notFound("Conversation not found.");
    }
    const patch: Record<string, unknown> = {};
    if (body.status) {
      if (!["open", "closed", "snoozed", "bot"].includes(body.status)) {
        return invalidRequest("invalid_status", `Unknown status: ${body.status}`, "status");
      }
      patch.status = body.status;
    }
    if ("assigned_to" in body) patch.assigned_to = body.assigned_to;
    if ("snooze_until" in body) patch.snooze_until = body.snooze_until;
    if (Object.keys(patch).length === 0) {
      return invalidRequest("nothing_to_update", "No updatable fields supplied.");
    }
    const { data, error } = await admin
      .from("conversations")
      .update(patch)
      .eq("id", params.id)
      .select(CONV_COLS)
      .single();
    if (error) {
      return NextResponse.json(
        { error: { type: "internal", code: "db_error", message: error.message } },
        { status: 500 },
      );
    }
    // Emit semantic events based on what changed.
    if (body.status === "closed" && existing.status !== "closed") {
      void emit({ type: "conversation.closed", orgId: ctx.orgId, data: shapeConversation(data) });
      // Fire CSAT/NPS on API-driven close too (no-op unless the org enabled it).
      void maybeSendSurvey(params.id);
    }
    if ("assigned_to" in body && body.assigned_to !== existing.assigned_to) {
      void emit({
        type: body.assigned_to ? "conversation.assigned" : "conversation.unassigned",
        orgId: ctx.orgId,
        data: shapeConversation(data),
        previousAttributes: { assigned_to: existing.assigned_to },
      });
    }
    return shapeConversation(data);
  },
});
