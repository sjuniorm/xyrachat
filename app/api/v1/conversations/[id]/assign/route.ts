import { type NextRequest } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, invalidRequest } from "@/lib/api/errors";
import { shapeConversation } from "@/lib/api/shapes";
import { emit } from "@/lib/api/emit";

export const runtime = "nodejs";

const CONV_COLS =
  "id, channel_id, contact_id, assigned_to, status, last_message_at, last_inbound_at, snooze_until, created_at, org_id";

// POST /api/v1/conversations/:id/assign
// body: { agent_id: string | null }   (null = unassign)
export const POST = apiHandler({
  scopes: ["conversations:write"],
  handler: async (req: NextRequest, ctx, params) => {
    let body: { agent_id?: string | null };
    try {
      body = await req.json();
    } catch {
      return invalidRequest("invalid_json", "Request body must be valid JSON.");
    }
    if (!("agent_id" in body)) {
      return invalidRequest("missing_field", "agent_id required (use null to unassign).", "agent_id");
    }
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("conversations")
      .select("id, org_id, assigned_to")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing || existing.org_id !== ctx.orgId) {
      return notFound("Conversation not found.");
    }
    // If assigning, verify the agent belongs to the same org.
    if (body.agent_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("id, org_id")
        .eq("id", body.agent_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!profile || profile.org_id !== ctx.orgId) {
        return invalidRequest("agent_not_in_org", "Agent does not belong to your org.", "agent_id");
      }
    }
    const { data } = await admin
      .from("conversations")
      .update({ assigned_to: body.agent_id ?? null })
      .eq("id", params.id)
      .select(CONV_COLS)
      .single();
    if (data && existing.assigned_to !== body.agent_id) {
      void emit({
        type: body.agent_id ? "conversation.assigned" : "conversation.unassigned",
        orgId: ctx.orgId,
        data: shapeConversation(data),
        previousAttributes: { assigned_to: existing.assigned_to },
      });
    }
    return data ? shapeConversation(data) : { id: params.id, assigned_to: body.agent_id };
  },
});
