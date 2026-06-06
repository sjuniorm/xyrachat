import { type NextRequest } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "@/lib/api/errors";
import { shapeContact } from "@/lib/api/shapes";
import { emit } from "@/lib/api/emit";

export const runtime = "nodejs";

const CONTACT_COLS =
  "id, name, phone, email, instagram_id, telegram_id, tags, notes, opted_out, created_at";

// POST /api/v1/contacts/:id/opt_out
// Body: { reason?: string }
// Sets opted_out=true + writes an opt_out_log row.
export const POST = apiHandler({
  scopes: ["contacts:write"],
  handler: async (req: NextRequest, ctx, params) => {
    let body: { reason?: string } = {};
    try {
      body = await req.json();
    } catch {
      // empty body OK
    }
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("contacts")
      .select("id, org_id, opted_out")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing || existing.org_id !== ctx.orgId) {
      return notFound("Contact not found.");
    }
    if (!existing.opted_out) {
      // Independent writes to two tables — run in parallel.
      await Promise.all([
        admin
          .from("contacts")
          .update({
            opted_out: true,
            opted_out_at: new Date().toISOString(),
            opt_out_reason: body.reason ?? "api",
          })
          .eq("id", params.id),
        admin.from("opt_out_log").insert({
          org_id: ctx.orgId,
          contact_id: params.id,
          channel_type: null,
          action: "opt_out",
          keyword: null,
          message_content: body.reason ?? "Opted out via API",
        }),
      ]);
    }
    const { data: row } = await admin
      .from("contacts")
      .select(CONTACT_COLS)
      .eq("id", params.id)
      .single();
    if (row) {
      void emit({
        type: "contact.opted_out",
        orgId: ctx.orgId,
        data: shapeContact(row) as Record<string, unknown>,
      });
    }
    return row ? shapeContact(row) : { id: params.id, opted_out: true };
  },
});
