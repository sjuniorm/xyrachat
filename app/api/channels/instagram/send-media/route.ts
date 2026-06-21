import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const IG_GRAPH_VERSION = "v22.0";
const BUCKET = "chat-media";
const SIGNED_TTL = 3600; // Meta fetches the media within this window

// Instagram DM attachments support image / video / audio (NOT documents).
const MEDIA: Record<string, { kind: "image" | "video" | "audio"; max: number; ext: string }> = {
  "image/jpeg": { kind: "image", max: 8 * 1024 * 1024, ext: "jpg" },
  "image/png": { kind: "image", max: 8 * 1024 * 1024, ext: "png" },
  "video/mp4": { kind: "video", max: 25 * 1024 * 1024, ext: "mp4" },
  "audio/mpeg": { kind: "audio", max: 25 * 1024 * 1024, ext: "mp3" },
  "audio/ogg": { kind: "audio", max: 25 * 1024 * 1024, ext: "ogg" },
};

export async function POST(req: Request) {
  const { supabase, user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("channel:send:instagram", user.id, { limit: 120, windowSec: 60 });
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
  if (!conversationId) return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "file required" }, { status: 400 });
  const mime = file.type || "application/octet-stream";
  const cfg = MEDIA[mime];
  if (!cfg) {
    return NextResponse.json(
      { error: `Unsupported on Instagram: ${mime}. Allowed: JPG, PNG, MP4, MP3, OGG (no documents).` },
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
    admin
      .from("channels")
      .select("id, type, page_id, ig_business_account_id, access_token_vault_id, metadata")
      .eq("id", conv.channel_id)
      .maybeSingle(),
    admin.from("contacts").select("id, instagram_id").eq("id", conv.contact_id).maybeSingle(),
  ]);
  if (!channel || channel.type !== "instagram") return NextResponse.json({ error: "Channel is not Instagram" }, { status: 400 });
  if (!channel.access_token_vault_id) return NextResponse.json({ error: "Channel missing token" }, { status: 400 });
  if (!contact?.instagram_id) return NextResponse.json({ error: "Contact has no instagram_id" }, { status: 400 });

  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) return NextResponse.json({ error: "Token missing from vault" }, { status: 500 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytesMatchMime(bytes, mime)) {
    return NextResponse.json({ error: "File content doesn't match its type." }, { status: 415 });
  }

  // Store in the private bucket, then mint a time-limited SIGNED URL for Meta to
  // fetch (the private /api/media proxy isn't reachable by Meta). The stored
  // message keeps the authed proxy path so the agent inbox renders it.
  const path = `${conv.id}/${randomUUID()}.${cfg.ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 502 });
  const mediaUrl = `/api/media/${BUCKET}/${path}`;
  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  if (signErr || !signed?.signedUrl) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: "Could not sign media URL" }, { status: 502 });
  }

  // IG-direct vs Page-linked (same split as the text send route).
  const useIgDirect = !channel.page_id && Boolean(channel.ig_business_account_id);
  const igLoginUserId =
    (channel.metadata as { ig_login_user_id?: string } | null)?.ig_login_user_id ?? channel.ig_business_account_id;
  const url = useIgDirect
    ? `https://graph.instagram.com/${IG_GRAPH_VERSION}/${igLoginUserId}/messages`
    : `https://graph.facebook.com/${IG_GRAPH_VERSION}/${channel.page_id}/messages`;

  const metaRes = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: contact.instagram_id },
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
      { error: metaJson?.error?.message ?? `Meta API error (HTTP ${metaRes.status})` },
      { status: 502 },
    );
  }

  const { data: stored, error: insertErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conv.id,
      direction: "outbound",
      content: null,
      media_url: mediaUrl,
      media_type: cfg.kind,
      sender_type: "agent",
      sender_id: user.id,
      status: "sent",
      ig_message_id: metaJson?.message_id ?? null,
      metadata: file.name ? { media_filename: file.name } : {},
    })
    .select("*")
    .single();
  if (insertErr) console.error("[ig send-media] sent to Meta but failed to save locally", insertErr);

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
    case "video/mp4":
      return at(4, [0x66, 0x74, 0x79, 0x70]);
    case "audio/mpeg":
      return at(0, [0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    case "audio/ogg":
      return at(0, [0x4f, 0x67, 0x67, 0x53]);
    default:
      return false;
  }
}
