import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { rateLimit } from "@/lib/rate-limit";
import { rejectOversizeUpload } from "@/lib/channels/upload-limits";

export const runtime = "nodejs";

const META_GRAPH_VERSION = "v22.0";
const BUCKET = "chat-media";

// WhatsApp media types we support outbound, with per-type size caps (bytes)
// and the message `type` Meta expects. Mime → config.
const MEDIA: Record<string, { kind: "image" | "video" | "audio" | "document"; max: number; ext: string }> = {
  "image/jpeg": { kind: "image", max: 5 * 1024 * 1024, ext: "jpg" },
  "image/png": { kind: "image", max: 5 * 1024 * 1024, ext: "png" },
  "image/webp": { kind: "image", max: 5 * 1024 * 1024, ext: "webp" },
  "video/mp4": { kind: "video", max: 16 * 1024 * 1024, ext: "mp4" },
  "video/3gpp": { kind: "video", max: 16 * 1024 * 1024, ext: "3gp" },
  "audio/mpeg": { kind: "audio", max: 16 * 1024 * 1024, ext: "mp3" },
  "audio/ogg": { kind: "audio", max: 16 * 1024 * 1024, ext: "ogg" },
  "application/pdf": { kind: "document", max: 16 * 1024 * 1024, ext: "pdf" },
};

export async function POST(req: Request) {
  // 1. Auth (web session cookie OR mobile JWT).
  const { supabase, user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("channel:send:whatsapp", user.id, { limit: 120, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Slow down — too many messages." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  // 2. Parse multipart.
  // DoS guard: reject an oversized body by Content-Length before buffering it.
  const tooLarge = rejectOversizeUpload(req);
  if (tooLarge) return tooLarge;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  const conversationId = String(form.get("conversationId") ?? "");
  const caption = String(form.get("caption") ?? "").trim();
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const mime = file.type || "application/octet-stream";
  const cfg = MEDIA[mime];
  if (!cfg) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mime}. Allowed: JPG, PNG, WebP, MP4, MP3, OGG, PDF.` },
      { status: 415 },
    );
  }
  if (file.size > cfg.max) {
    return NextResponse.json(
      { error: `File too large for ${cfg.kind} (max ${Math.round(cfg.max / 1024 / 1024)} MB).` },
      { status: 413 },
    );
  }

  // 3. Load conversation (RLS-scoped to the agent's org).
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, channel_id, contact_id, org_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // 4. Channel + contact (admin; org already RLS-verified above).
  const admin = createAdminClient();
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("id, type, phone_number_id, access_token_vault_id")
      .eq("id", conv.channel_id)
      .maybeSingle(),
    admin.from("contacts").select("id, phone").eq("id", conv.contact_id).maybeSingle(),
  ]);
  if (!channel || channel.type !== "whatsapp") {
    return NextResponse.json({ error: "Channel is not WhatsApp" }, { status: 400 });
  }
  if (!channel.phone_number_id || !channel.access_token_vault_id) {
    return NextResponse.json({ error: "Channel missing phone_number_id or token" }, { status: 400 });
  }
  if (!contact?.phone) {
    return NextResponse.json({ error: "Contact has no phone" }, { status: 400 });
  }

  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) return NextResponse.json({ error: "Token missing from vault" }, { status: 500 });

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Reject content whose signature doesn't match its declared type (defense in
  // depth: stops arbitrary bytes being parked on the public bucket as image/*).
  if (!bytesMatchMime(bytes, mime)) {
    return NextResponse.json(
      { error: "File content doesn't match its type." },
      { status: 415 },
    );
  }

  // 5. Store in Supabase Storage so the inbox can render it (stable public URL).
  const path = `${conv.id}/${randomUUID()}.${cfg.ext}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 502 });
  }
  // The bucket is PRIVATE (migration 045) — store an authenticated proxy path,
  // not a public URL. /api/media/<bucket>/<path> verifies org ownership + streams.
  const mediaUrl = `/api/media/${BUCKET}/${path}`;

  // 6. Upload the same bytes to Meta /media to get a media id to send with.
  const metaForm = new FormData();
  metaForm.set("messaging_product", "whatsapp");
  metaForm.set("type", mime);
  metaForm.set("file", new Blob([bytes], { type: mime }), file.name || `upload.${cfg.ext}`);
  const upMeta = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.phone_number_id}/media`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: metaForm },
  );
  const upMetaJson = (await upMeta.json().catch(() => null)) as
    | { id?: string; error?: { message: string } }
    | null;
  if (!upMeta.ok || !upMetaJson?.id) {
    // Meta rejected the upload — don't leave an orphan in Storage.
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json(
      { error: upMetaJson?.error?.message ?? `Meta media upload failed (HTTP ${upMeta.status})` },
      { status: 502 },
    );
  }

  // 7. Send the message referencing the uploaded media id.
  const mediaObj: Record<string, unknown> = { id: upMetaJson.id };
  // Caption is allowed on image/video/document, not audio. Documents also take a filename.
  if (caption && cfg.kind !== "audio") mediaObj.caption = caption;
  if (cfg.kind === "document") mediaObj.filename = file.name || `document.${cfg.ext}`;

  const sendRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.phone_number_id}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: contact.phone,
        type: cfg.kind,
        [cfg.kind]: mediaObj,
      }),
    },
  );
  const sendJson = (await sendRes.json().catch(() => null)) as
    | { messages?: Array<{ id: string }>; error?: { message: string } }
    | null;
  if (!sendRes.ok || sendJson?.error) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json(
      { error: sendJson?.error?.message ?? `Meta send failed (HTTP ${sendRes.status})` },
      { status: 502 },
    );
  }
  const waMessageId = sendJson?.messages?.[0]?.id ?? null;

  // 8. Store the outbound message (media_url = stable public URL → inbox renders it).
  const { data: stored, error: insertErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conv.id,
      direction: "outbound",
      content: caption || null,
      media_url: mediaUrl,
      media_type: cfg.kind,
      sender_type: "agent",
      sender_id: user.id,
      status: "sent",
      wa_message_id: waMessageId,
      metadata: file.name ? { media_filename: file.name } : {},
    })
    .select("*")
    .single();

  if (insertErr) {
    // Sent on WhatsApp + uploaded, but we couldn't store the row locally. Keep
    // the Storage object (the message DID go out) and log for reconciliation.
    console.error("[wa send-media] sent to Meta but failed to save locally", insertErr);
  }

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  // `stored` lets the client distinguish "sent + visible" from "sent to the
  // customer but not stored locally" (insert failed) so it can warn instead of
  // prompting a resend (which would double-send the media).
  return NextResponse.json({
    message: stored ?? null,
    wa_message_id: waMessageId,
    stored: !!stored,
  });
}

// Verify the file's leading bytes match its declared MIME, so a client can't
// store arbitrary bytes on the public bucket behind an allowlisted content-type.
function bytesMatchMime(b: Uint8Array, mime: string): boolean {
  const at = (off: number, sig: number[]) => sig.every((v, i) => b[off + i] === v);
  switch (mime) {
    case "image/jpeg":
      return at(0, [0xff, 0xd8, 0xff]);
    case "image/png":
      return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]); // RIFF…WEBP
    case "video/mp4":
    case "video/3gpp":
      return at(4, [0x66, 0x74, 0x79, 0x70]); // 'ftyp' box
    case "audio/mpeg":
      return at(0, [0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0); // ID3 or frame sync
    case "audio/ogg":
      return at(0, [0x4f, 0x67, 0x67, 0x53]); // 'OggS'
    case "application/pdf":
      return at(0, [0x25, 0x50, 0x44, 0x46]); // '%PDF'
    default:
      return false;
  }
}
