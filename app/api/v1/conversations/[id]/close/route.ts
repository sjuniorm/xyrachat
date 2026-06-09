import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "@/lib/api/errors";
import { shapeConversation } from "@/lib/api/shapes";
import { emit } from "@/lib/api/emit";
import { maybeSendSurvey } from "@/lib/surveys/server";

export const runtime = "nodejs";

const CONV_COLS =
  "id, channel_id, contact_id, assigned_to, status, last_message_at, last_inbound_at, snooze_until, created_at, org_id";

export const POST = apiHandler({
  scopes: ["conversations:write"],
  handler: async (_req, ctx, params) => {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("conversations")
      .select("id, org_id, status")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing || existing.org_id !== ctx.orgId) {
      return notFound("Conversation not found.");
    }
    const { data } = await admin
      .from("conversations")
      .update({ status: "closed" })
      .eq("id", params.id)
      .select(CONV_COLS)
      .single();
    if (existing.status !== "closed" && data) {
      void emit({ type: "conversation.closed", orgId: ctx.orgId, data: shapeConversation(data) });
      // Fire CSAT/NPS on API-driven close too (no-op unless the org enabled it).
      void maybeSendSurvey(params.id);
    }
    return data ? shapeConversation(data) : { id: params.id, status: "closed" };
  },
});
