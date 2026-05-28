import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "@/lib/api/errors";

export const runtime = "nodejs";

// DELETE /api/v1/contacts/:id/tags/:tag — remove one tag.
export const DELETE = apiHandler({
  scopes: ["contacts:write"],
  handler: async (_req, ctx, params) => {
    const tag = decodeURIComponent(params.tag);
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
    const next = cur.filter((t) => t !== tag);
    if (next.length !== cur.length) {
      await admin.from("contacts").update({ tags: next }).eq("id", params.id);
    }
    return new NextResponse(null, { status: 204 });
  },
});
