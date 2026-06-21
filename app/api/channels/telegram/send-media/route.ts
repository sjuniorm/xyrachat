import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BUCKET = "chat-media";

// Outbound media types we support, with per-type caps + the Telegram Bot API
// method/field to use. Telegram bots can send up to 50 MB; we cap lower to match
// the inbox + the other channels. mime → config.
const MEDIA: Record<
  string,
  { kind: "image" | "video" | "audio" | "document"; method: string; field: string; max: number; ext: string }
> = {
  "image/jpeg": { kind: "image", method: "sendPhoto", field: "photo", max: 5 * 1024 * 1024, ext: "jpg" },
  "image/png": { kind: "image", method: "sendPhoto", field: "photo", max: 5 * 1024 * 1024, ext: "png" },
  "image/webp": { kind: "image", method: "sendPhoto", field: "photo", max: 5 * 1024 * 1024, ext: "webp" },
  "video/mp4": { kind: "video", method: "sendVideo", field: "video", max: 16 * 1024 * 1024, ext: "mp4" },
  "audio/mpeg": { kind: "audio", method: "sendAudio", field: "audio", max: 16 * 1024 * 1024, ext: "mp3" },
  "audio/ogg": { kind: "audio", method: "sendAudio", field: "audio", max: 16 * 1024 * 1024, ext: "ogg" },
  "application/pdf": { kind: "document", method: "sendDocument", field: "document", max: 16 * 1024 * 1024, ext: "pdf" },
};

export async function POST(req: Request) {
  const { supabase, user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("channel:send:telegram", user.id, { limit: 120, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Slow down — too many messages." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

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

  // Load conversation (RLS-scoped to the agent's org).
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, channel_id, contact_id, org_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin.from("channels").select("id, type, access_token_vault_id").eq("id", conv.channel_id).maybeSingle(),
    admin.from("contacts").select("id, telegram_id").eq("id", conv.contact_id).maybeSingle(),
  ]);
  if (!channel || channel.type !== "telegram") {
    return NextResponse.json({ error: "Channel is not Telegram" }, { status: 400 });
  }
  if (!channel.access_token_vault_id) {
    return NextResponse.json({ error: "Channel missing token" }, { status: 400 });
  }
  if (!contact?.telegram_id) {
    return NextResponse.json({ error: "Contact has no Telegram id" }, { status: 400 });
  }

  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) return NextResponse.json({ error: "Token missing from vault" }, { status: 500 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytesMatchMime(bytes, mime)) {
    return NextResponse.json({ error: "File content doesn't match its type." }, { status: 415 });
  }

  // Store in Supabase Storage (PRIVATE) so the agent inbox can render it via the
  // authenticated /api/media proxy. Telegram itself gets the raw bytes below.
  const path = `${conv.id}/${randomUUID()}.${cfg.ext}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 502 });
  }
  const mediaUrl = `/api/media/${BUCKET}/${path}`;

  // Upload the bytes to Telegram via the matching method (multipart).
  const tgForm = new FormData();
  tgForm.set("chat_id", contact.telegram_id);
  tgForm.set(cfg.field, new Blob([bytes], { type: mime }), file.name || `upload.${cfg.ext}`);
  if (caption) tgForm.set("caption", caption);
  const tgRes = await fetch(`https://api.telegram.org/bot${token}/${cfg.method}`, {
    method: "POST",
    body: tgForm,
  });
  const tgJson = (await tgRes.json().catch(() => null)) as
    | { ok: boolean; result?: { message_id: number; chat: { id: number } }; description?: string }
    | null;
  if (!tgRes.ok || !tgJson?.ok) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json(
      { error: tgJson?.description ?? `Telegram send failed (HTTP ${tgRes.status})` },
      { status: 502 },
    );
  }
  const tgKey = tgJson.result ? `${tgJson.result.chat.id}:${tgJson.result.message_id}` : null;

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
      telegram_message_id: tgKey,
      metadata: file.name ? { media_filename: file.name } : {},
    })
    .select("*")
    .single();
  if (insertErr) {
    console.error("[telegram send-media] sent to Telegram but failed to save locally", insertErr);
  }

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  return NextResponse.json({ message: stored ?? null, telegram_message_id: tgKey, stored: !!stored });
}

// Verify the file's leading bytes match its declared MIME (defense in depth so a
// client can't park arbitrary bytes on the bucket behind an allowlisted type).
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
