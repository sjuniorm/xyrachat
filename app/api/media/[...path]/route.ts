import { NextResponse, type NextRequest } from "next/server";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchProviderMedia } from "@/lib/ai/provider-media";

export const runtime = "nodejs";

// Inbound provider media (WhatsApp media_id / Telegram file_id) is referenced,
// not stored — resolve + stream it on demand, capped. Force a safe inline type
// from the resolved mime; anything not in this allowlist downloads as a blob.
const INBOUND_MAX_BYTES = 25 * 1024 * 1024;
const SAFE_INLINE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/3gpp",
  "audio/mpeg",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "audio/wav",
  "application/pdf",
]);

// Authenticated proxy for PRIVATE storage objects (migration 045). URL shape:
//   /api/media/<bucket>/<conversationId>/<uuid>.<ext>
// Serves the object ONLY to a signed-in member of the org that owns the
// conversation in the path. The bucket is private, so this proxy (admin client)
// is the only read path — a leaked URL is useless without a valid session.
//
// Auth: web cookie OR mobile Supabase JWT (getRouteUser). Org check: an RLS
// SELECT on the conversation — a row comes back only if it's the caller's org.

const ALLOWED_BUCKETS = new Set(["chat-media"]);
// Force the served Content-Type from the file extension via a strict allowlist —
// NEVER trust the stored type, and NEVER serve a script-capable type (svg/html/
// xml) inline on our own origin. Anything not in here is force-downloaded as a
// generic blob so it can't execute even if it somehow got into the bucket.
const SAFE_INLINE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  "3gp": "video/3gpp",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  pdf: "application/pdf",
};
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

  // Inbound provider-media proxy: /api/media/inbound/<messageId>. Resolves the
  // stored provider ref (WA media_id / TG file_id) to bytes via the channel
  // token and streams them. Org auth is the RLS SELECT on the message.
  if (path?.length === 2 && path[0] === "inbound") {
    return serveInboundMedia(supabase, path[1]);
  }

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
  const ext = filename.split(".").pop()!.toLowerCase();
  const safeType = SAFE_INLINE_TYPES[ext];

  const headers: Record<string, string> = {
    // Private + short cache: re-checks auth reasonably often without re-fetching
    // the bytes on every render.
    "Cache-Control": "private, max-age=3600",
    "Content-Length": String(buf.byteLength),
    // Defense in depth against same-origin XSS if a script-capable object ever
    // lands in the bucket: never sniff, never allow scripts, keep it same-origin.
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (safeType) {
    headers["Content-Type"] = safeType;
    headers["Content-Disposition"] = `inline; filename="${filename}"`;
  } else {
    // Unknown/unsafe extension → force a download as an opaque blob; never render
    // it inline on our origin.
    headers["Content-Type"] = "application/octet-stream";
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  return new Response(buf, { headers });
}

async function serveInboundMedia(
  supabase: Awaited<ReturnType<typeof getRouteUser>>["supabase"],
  messageId: string,
) {
  if (!UUID_RE.test(messageId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // RLS scopes messages to the caller's org (via conversation→org), so this
  // returns a row only if the caller may see it.
  const { data: msg } = await supabase
    .from("messages")
    .select("id, media_url, conversation_id")
    .eq("id", messageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!msg?.media_url || !msg.conversation_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("conversations")
    .select("channel_id")
    .eq("id", msg.conversation_id)
    .maybeSingle();
  if (!conv?.channel_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: channel } = await admin
    .from("channels")
    .select("id, type")
    .eq("id", conv.channel_id)
    .maybeSingle();
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const media = await fetchProviderMedia(
    channel.type,
    channel.id,
    msg.media_url as string,
    admin,
    INBOUND_MAX_BYTES,
  );
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const safe = SAFE_INLINE_MIME.has(media.mime);
  const headers: Record<string, string> = {
    "Cache-Control": "private, max-age=3600",
    "Content-Length": String(media.bytes.byteLength),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Type": safe ? media.mime : "application/octet-stream",
    "Content-Disposition": safe ? "inline" : `attachment; filename="${messageId}"`,
  };
  return new Response(media.bytes, { headers });
}
