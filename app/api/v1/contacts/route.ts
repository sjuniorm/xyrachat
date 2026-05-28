import { NextResponse, type NextRequest } from "next/server";
import { requireApiKey, logApiRequest } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeCursor, encodeCursor, parseLimit } from "@/lib/api/pagination";
import { getCachedIdempotentResponse, storeIdempotentResponse } from "@/lib/api/idempotency";
import { invalidRequest } from "@/lib/api/errors";
import { emit } from "@/lib/api/emit";

export const runtime = "nodejs";

// GET /api/v1/contacts — list with cursor pagination.
export async function GET(req: NextRequest) {
  const start = Date.now();
  const auth = await requireApiKey(req, "contacts:read");
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) {
    return invalidRequest("invalid_cursor", "Cursor is malformed.");
  }

  const admin = createAdminClient();
  let q = admin
    .from("contacts")
    .select("id, name, phone, email, instagram_id, telegram_id, tags, notes, opted_out, created_at")
    .eq("org_id", auth.ctx.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    // Strict less-than on (created_at, id). Composite comparison via two
    // OR'd predicates because Supabase's filter chain doesn't support
    // tuple ordering directly.
    q = q.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: { type: "internal", code: "db_error", message: error.message } },
      { status: 500 },
    );
  }
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? encodeCursor({ id: last.id, created_at: last.created_at })
    : null;

  void logApiRequest({
    apiKeyId: auth.ctx.apiKeyId,
    orgId: auth.ctx.orgId,
    method: "GET",
    path: "/api/v1/contacts",
    status: 200,
    durationMs: Date.now() - start,
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    idempotencyKey: null,
  });
  return NextResponse.json({
    object: "list",
    data: page.map(shapeContact),
    has_more: hasMore,
    next_cursor: nextCursor,
  });
}

// POST /api/v1/contacts — create or upsert by phone/email/instagram_id.
export async function POST(req: NextRequest) {
  const start = Date.now();
  const auth = await requireApiKey(req, "contacts:write");
  if (!auth.ok) return auth.response;

  const idempotencyKey = req.headers.get("idempotency-key");
  const cached = await getCachedIdempotentResponse(auth.ctx.apiKeyId, idempotencyKey);
  if (cached) {
    return NextResponse.json(cached.body, { status: cached.status });
  }

  let body: {
    name?: string;
    phone?: string;
    email?: string;
    instagram_id?: string;
    telegram_id?: string;
    tags?: string[];
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return invalidRequest("invalid_json", "Request body must be valid JSON.");
  }
  if (!body.phone && !body.email && !body.instagram_id && !body.telegram_id) {
    return invalidRequest(
      "missing_identifier",
      "Provide at least one of: phone, email, instagram_id, telegram_id.",
    );
  }

  const admin = createAdminClient();
  // Best-effort dedupe: look for an existing contact with any matching
  // identifier in this org. If found, update + return; otherwise insert.
  // Order matters — phone is the strongest match, then email, then social.
  const lookups = [
    body.phone ? { col: "phone", val: body.phone } : null,
    body.email ? { col: "email", val: body.email.toLowerCase() } : null,
    body.instagram_id ? { col: "instagram_id", val: body.instagram_id } : null,
    body.telegram_id ? { col: "telegram_id", val: body.telegram_id } : null,
  ].filter(Boolean) as Array<{ col: string; val: string }>;

  let existingId: string | null = null;
  for (const l of lookups) {
    const { data: hit } = await admin
      .from("contacts")
      .select("id")
      .eq("org_id", auth.ctx.orgId)
      .eq(l.col, l.val)
      .is("deleted_at", null)
      .maybeSingle();
    if (hit) {
      existingId = hit.id;
      break;
    }
  }

  if (existingId) {
    const patch: Record<string, unknown> = {};
    if (body.name) patch.name = body.name;
    if (body.tags) patch.tags = body.tags;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (Object.keys(patch).length > 0) {
      await admin.from("contacts").update(patch).eq("id", existingId);
    }
    const { data: full } = await admin
      .from("contacts")
      .select("id, name, phone, email, instagram_id, telegram_id, tags, notes, opted_out, created_at")
      .eq("id", existingId)
      .maybeSingle();
    const resBody = full ? shapeContact(full) : null;
    void storeIdempotentResponse(auth.ctx.apiKeyId, idempotencyKey, {
      status: 200,
      body: resBody,
    });
    void logApiRequest({
      apiKeyId: auth.ctx.apiKeyId,
      orgId: auth.ctx.orgId,
      method: "POST",
      path: "/api/v1/contacts",
      status: 200,
      durationMs: Date.now() - start,
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
      idempotencyKey,
    });
    if (full) {
      void emit({
        type: "contact.updated",
        orgId: auth.ctx.orgId,
        data: shapeContact(full) as Record<string, unknown>,
      });
    }
    return NextResponse.json(resBody, { status: 200 });
  }

  const { data, error } = await admin
    .from("contacts")
    .insert({
      org_id: auth.ctx.orgId,
      name: body.name ?? null,
      phone: body.phone ?? null,
      email: body.email?.toLowerCase() ?? null,
      instagram_id: body.instagram_id ?? null,
      telegram_id: body.telegram_id ?? null,
      tags: body.tags ?? [],
      notes: body.notes ?? null,
    })
    .select("id, name, phone, email, instagram_id, telegram_id, tags, notes, opted_out, created_at")
    .single();
  if (error) {
    return NextResponse.json(
      { error: { type: "internal", code: "db_error", message: error.message } },
      { status: 500 },
    );
  }
  const resBody = shapeContact(data);
  void storeIdempotentResponse(auth.ctx.apiKeyId, idempotencyKey, {
    status: 201,
    body: resBody,
  });
  void emit({
    type: "contact.created",
    orgId: auth.ctx.orgId,
    data: resBody as Record<string, unknown>,
  });
  void logApiRequest({
    apiKeyId: auth.ctx.apiKeyId,
    orgId: auth.ctx.orgId,
    method: "POST",
    path: "/api/v1/contacts",
    status: 201,
    durationMs: Date.now() - start,
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    idempotencyKey,
  });
  return NextResponse.json(resBody, { status: 201 });
}

function shapeContact(row: {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  instagram_id: string | null;
  telegram_id: string | null;
  tags: string[] | null;
  notes: string | null;
  opted_out: boolean;
  created_at: string;
}) {
  return {
    object: "contact",
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    instagram_id: row.instagram_id,
    telegram_id: row.telegram_id,
    tags: row.tags ?? [],
    notes: row.notes,
    opted_out: row.opted_out,
    created_at: row.created_at,
  };
}
