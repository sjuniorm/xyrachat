import { type NextRequest } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, invalidRequest } from "@/lib/api/errors";
import { shapeContact } from "@/lib/api/shapes";
import { emit } from "@/lib/api/emit";

export const runtime = "nodejs";

const CONTACT_COLS =
  "id, name, phone, email, instagram_id, telegram_id, tags, notes, opted_out, created_at";

// POST /api/v1/contacts/:id/tags
// body: { tag: string } OR { tags: string[] }
// Adds one or more tags, deduplicated. Idempotent.
export const POST = apiHandler({
  scopes: ["contacts:write"],
  handler: async (req: NextRequest, ctx, params) => {
    let body: { tag?: string; tags?: string[] };
    try {
      body = await req.json();
    } catch {
      return invalidRequest("invalid_json", "Request body must be valid JSON.");
    }
    const toAdd = (body.tags ?? (body.tag ? [body.tag] : []))
      .map((t) => t.trim())
      .filter(Boolean);
    if (toAdd.length === 0) {
      return invalidRequest("missing_field", "Provide `tag` or `tags`.");
    }
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("contacts")
      .select("tags, org_id")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing || existing.org_id !== ctx.orgId) {
      return notFound("Contact not found.");
    }
    const cur = (existing.tags ?? []) as string[];
    const next = Array.from(new Set([...cur, ...toAdd]));
    const { data: row } = await admin
      .from("contacts")
      .update({ tags: next })
      .eq("id", params.id)
      .select(CONTACT_COLS)
      .single();
    void emit({
      type: "contact.tagged",
      orgId: ctx.orgId,
      data: row ? (shapeContact(row) as Record<string, unknown>) : { id: params.id, tags: next },
    });
    return row ? shapeContact(row) : { id: params.id, tags: next };
  },
});
