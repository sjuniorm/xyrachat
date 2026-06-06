import { type NextRequest } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, invalidRequest } from "@/lib/api/errors";
import { emit } from "@/lib/api/emit";

export const runtime = "nodejs";

// POST /api/v1/bots/:id/handoff
// body: { conversation_id: string, reason?: string }
// Marks the conversation as handed off — sets status='open' + emits
// bot.handoff. Doesn't pick an agent (that's the customer's automation
// or their assignment workflow).
export const POST = apiHandler({
  scopes: ["bots:write"],
  handler: async (req: NextRequest, ctx, params) => {
    let body: { conversation_id?: string; reason?: string };
    try {
      body = await req.json();
    } catch {
      return invalidRequest("invalid_json", "Request body must be valid JSON.");
    }
    if (!body.conversation_id) {
      return invalidRequest("missing_field", "conversation_id required.", "conversation_id");
    }
    const admin = createAdminClient();
    const [{ data: bot }, { data: conv }] = await Promise.all([
      admin
        .from("bots")
        .select("id, org_id")
        .eq("id", params.id)
        .is("deleted_at", null)
        .maybeSingle(),
      admin
        .from("conversations")
        .select("id, org_id, status")
        .eq("id", body.conversation_id)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
    if (!bot || bot.org_id !== ctx.orgId) return notFound("Bot not found.");
    if (!conv || conv.org_id !== ctx.orgId) return notFound("Conversation not found.");

    // Two independent writes to different tables — run in parallel.
    await Promise.all([
      admin.from("conversations").update({ status: "open" }).eq("id", body.conversation_id),
      admin.from("bot_outcomes").insert({
        bot_id: bot.id,
        conversation_id: body.conversation_id,
        type: "handoff",
        payload: { reason: body.reason ?? "api_requested", source: "api" },
      }),
    ]);
    void emit({
      type: "bot.handoff",
      orgId: ctx.orgId,
      data: {
        bot_id: bot.id,
        conversation_id: body.conversation_id,
        reason: body.reason ?? "api_requested",
      },
    });
    return { object: "bot_handoff", bot_id: bot.id, conversation_id: body.conversation_id };
  },
});
