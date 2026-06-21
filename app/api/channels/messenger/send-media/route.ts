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
const SIGNED_TTL = 3600;

// Messenger attachments: image / video / audio / file (file covers documents).
const MEDIA: Record<string, { kind: "image" | "video" | "audio" | "file"; max: number; ext: string }> = {
  "image/jpeg": { kind: "image", max: 8 * 1024 * 1024, ext: "jpg" },
  "image/png": { kind: "image", max: 8 * 1024 * 1024, ext: "png" },
  "image/webp": { kind: "image", max: 8 * 1024 * 1024, ext: "webp" },
  "video/mp4": { kind: "video", max: 25 * 1024 * 1024, ext: "mp4" },
  "audio/mpeg": { kind: "audio", max: 25 * 1024 * 1024, ext: "mp3" },
  "audio/ogg": { kind: "audio", max: 25 * 1024 * 1024, ext: "ogg" },
  "application/pdf": { kind: "file", max: 25 * 1024 * 1024, ext: "pdf" },
};

export async function POST(req: Request) {
  const { supabase, user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("channel:send:messenger", user.id, { limit: 120, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Slow down — too many messages." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

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
  if (!conversationId) return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "file required" }, { status: 400 });
  const mime = file.type || "application/octet-stream";
  const cfg = MEDIA[mime];
  if (!cfg) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mime}. Allowed: JPG, PNG, WebP, MP4, MP3, OGG, PDF.` },
      { status: 415 },
    );
  }
  if (file.size > cfg.max) {
    return NextResponse.json({ error: `File too large (max ${Math.round(cfg.max / 1024 / 1024)} MB).` }, { status: 413 });
  }

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, channel_id, contact_id, org_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr || !conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const admin = createAdminClient();
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin.from("channels").select("id, type, page_id, access_token_vault_id").eq("id", conv.channel_id).maybeSingle(),
    admin.from("contacts").select("id, messenger_id").eq("id", conv.contact_id).maybeSingle(),
  ]);
  if (!channel || channel.type !== "facebook") return NextResponse.json({ error: "Channel is not Messenger" }, { status: 400 });
  if (!channel.page_id || !channel.access_token_vault_id) {
    return NextResponse.json({ error: "Channel missing page_id or token" }, { status: 400 });
  }
  if (!contact?.messenger_id) return NextResponse.json({ error: "Contact has no messenger_id" }, { status: 400 });

  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) return NextResponse.json({ error: "Token missing from vault" }, { status: 500 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytesMatchMime(bytes, mime)) {
    return NextResponse.json({ error: "File content doesn't match its type." }, { status: 415 });
  }

  const path = `${conv.id}/${randomUUID()}.${cfg.ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 502 });
  const mediaUrl = `/api/media/${BUCKET}/${path}`;
  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  if (signErr || !signed?.signedUrl) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: "Could not sign media URL" }, { status: 502 });
  }

  const metaRes = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.page_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: contact.messenger_id },
      messaging_type: "RESPONSE",
      message: { attachment: { type: cfg.kind, payload: { url: signed.signedUrl, is_reusable: false } } },
    }),
  });
  const metaJson = (await metaRes.json().catch(() => null)) as
    | { message_id?: string; error?: { message: string } }
    | null;
  if (!metaRes.ok || metaJson?.error) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json(
      { error: metaJson?.error?.message ?? `Messenger API error (HTTP ${metaRes.status})` },
      { status: 502 },
    );
  }

  // Messenger inbox renders image/video/audio; documents come through as "file".
  const inboxKind = cfg.kind === "file" ? "document" : cfg.kind;
  const { data: stored, error: insertErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conv.id,
      direction: "outbound",
      content: null,
      media_url: mediaUrl,
      media_type: inboxKind,
      sender_type: "agent",
      sender_id: user.id,
      status: "sent",
      messenger_message_id: metaJson?.message_id ?? null,
      metadata: file.name ? { media_filename: file.name } : {},
    })
    .select("*")
    .single();
  if (insertErr) console.error("[messenger send-media] sent to Meta but failed to save locally", insertErr);

  await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);

  return NextResponse.json({ message: stored ?? null, stored: !!stored });
}

function bytesMatchMime(b: Uint8Array, mime: string): boolean {
  const at = (off: number, sig: number[]) => sig.every((v, i) => b[off + i] === v);
  switch (mime) {
    case "image/jpeg":
      return at(0, [0xff, 0xd8, 0xff]);
    case "image/png":
      return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]);
    case "video/mp4":
      return at(4, [0x66, 0x74, 0x79, 0x70]);
    case "audio/mpeg":
      return at(0, [0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    case "audio/ogg":
      return at(0, [0x4f, 0x67, 0x67, 0x53]);
    case "application/pdf":
      return at(0, [0x25, 0x50, 0x44, 0x46]);
    default:
      return false;
  }
}
