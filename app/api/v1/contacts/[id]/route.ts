import { NextResponse, type NextRequest } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, invalidRequest } from "@/lib/api/errors";
import { shapeContact } from "@/lib/api/shapes";
import { emit } from "@/lib/api/emit";

export const runtime = "nodejs";

const CONTACT_COLS =
  "id, name, phone, email, instagram_id, telegram_id, tags, notes, opted_out, created_at";

export const GET = apiHandler({
  scopes: ["contacts:read"],
  handler: async (_req, ctx, params) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("contacts")
      .select(CONTACT_COLS)
      .eq("id", params.id)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return notFound("Contact not found.");
    return shapeContact(data);
  },
});

export const PATCH = apiHandler({
  scopes: ["contacts:write"],
  handler: async (req: NextRequest, ctx, params) => {
    let body: {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
      instagram_id?: string | null;
      telegram_id?: string | null;
      notes?: string | null;
      tags?: string[];
    };
    try {
      body = await req.json();
    } catch {
      return invalidRequest("invalid_json", "Request body must be valid JSON.");
    }
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("contacts")
      .select("id, org_id")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing || existing.org_id !== ctx.orgId) {
      return notFound("Contact not found.");
    }
    const allowed = ["name", "phone", "email", "instagram_id", "telegram_id", "notes", "tags"] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in body) patch[k] = body[k];
    }
    if (typeof patch.email === "string") patch.email = patch.email.toLowerCase();
    if (Object.keys(patch).length === 0) {
      return invalidRequest("nothing_to_update", "No updatable fields supplied.");
    }
    const { data, error } = await admin
      .from("contacts")
      .update(patch)
      .eq("id", params.id)
      .select(CONTACT_COLS)
      .single();
    if (error) {
      return NextResponse.json(
        { error: { type: "internal", code: "db_error", message: error.message } },
        { status: 500 },
      );
    }
    void emit({
      type: "contact.updated",
      orgId: ctx.orgId,
      data: shapeContact(data) as Record<string, unknown>,
      previousAttributes: patch,
    });
    return shapeContact(data);
  },
});

export const DELETE = apiHandler({
  scopes: ["contacts:write"],
  handler: async (_req, ctx, params) => {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("contacts")
      .select("id, org_id")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing || existing.org_id !== ctx.orgId) {
      return notFound("Contact not found.");
    }
    await admin
      .from("contacts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", params.id);
    return new NextResponse(null, { status: 204 });
  },
});
