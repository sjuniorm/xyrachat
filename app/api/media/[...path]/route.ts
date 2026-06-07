import { NextResponse, type NextRequest } from "next/server";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Authenticated proxy for PRIVATE storage objects (migration 045). URL shape:
//   /api/media/<bucket>/<conversationId>/<uuid>.<ext>
// Serves the object ONLY to a signed-in member of the org that owns the
// conversation in the path. The bucket is private, so this proxy (admin client)
// is the only read path — a leaked URL is useless without a valid session.
//
// Auth: web cookie OR mobile Supabase JWT (getRouteUser). Org check: an RLS
// SELECT on the conversation — a row comes back only if it's the caller's org.

const ALLOWED_BUCKETS = new Set(["chat-media"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The filename is always a randomUUID() + a short extension. Validating it
// strictly (and requiring EXACTLY one filename segment) is what binds the
// object path to the org-checked conversation — without it an encoded-slash
// (%2f) "../otherConv/x" segment could escape the prefix and read another
// org's object while passing the conversationId check.
const FILENAME_RE = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { supabase, user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path } = await params;
  // EXACT shape: <bucket>/<conversationId-uuid>/<uuid.ext>. Anything else
  // (extra segments, an encoded-slash traversal payload in the filename, a
  // non-uuid id) is rejected — the object path can only ever be the validated
  // conversation's own folder.
  if (!path || path.length !== 3) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [bucket, conversationId, filename] = path;
  if (
    !ALLOWED_BUCKETS.has(bucket) ||
    !UUID_RE.test(conversationId) ||
    !FILENAME_RE.test(filename)
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const objectPath = `${conversationId}/${filename}`;

  // Authorize via RLS: the conversation is returned only if it's the caller's org.
  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from(bucket).download(objectPath);
  if (error || !blob) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buf = await blob.arrayBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      // Private + short cache: re-validates auth reasonably often without
      // re-fetching the bytes on every render.
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(buf.byteLength),
    },
  });
}
