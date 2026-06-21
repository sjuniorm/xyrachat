import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { rejectOversizeUpload } from "@/lib/channels/upload-limits";
import { sanitizeEmailHtml } from "@/lib/security/sanitize";
import type { ChannelMetadata } from "@/lib/db-types";

export const runtime = "nodejs";

const BUCKET = "chat-media";

// Outbound email attachments — same allowlist + caps as the other channels, with
// the inbox media "kind" for rendering. mime → config.
const MEDIA: Record<string, { kind: "image" | "video" | "audio" | "document"; max: number; ext: string }> = {
  "image/jpeg": { kind: "image", max: 10 * 1024 * 1024, ext: "jpg" },
  "image/png": { kind: "image", max: 10 * 1024 * 1024, ext: "png" },
  "image/webp": { kind: "image", max: 10 * 1024 * 1024, ext: "webp" },
  "video/mp4": { kind: "video", max: 25 * 1024 * 1024, ext: "mp4" },
  "audio/mpeg": { kind: "audio", max: 25 * 1024 * 1024, ext: "mp3" },
  "audio/ogg": { kind: "audio", max: 25 * 1024 * 1024, ext: "ogg" },
  "application/pdf": { kind: "document", max: 25 * 1024 * 1024, ext: "pdf" },
};

function textToHtml(t: string): string {
  const esc = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div>${esc.replace(/\r?\n/g, "<br>")}</div>`;
}

export async function POST(req: Request) {
  const { supabase, user } = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("channel:send:email", user.id, { limit: 120, windowSec: 60 });
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
  const caption = String(form.get("caption") ?? "").trim();
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
    return NextResponse.json(
      { error: `File too large (max ${Math.round(cfg.max / 1024 / 1024)} MB).` },
      { status: 413 },
    );
  }

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, channel_id, contact_id, org_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr || !conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const admin = createAdminClient();
  const [{ data: channel }, { data: contact }, { data: lastInbound }] = await Promise.all([
    admin.from("channels").select("id, type, inbox_email, metadata, name").eq("id", conv.channel_id).maybeSingle(),
    admin.from("contacts").select("id, email").eq("id", conv.contact_id).maybeSingle(),
    admin
      .from("messages")
      .select("email_message_id, metadata")
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .not("email_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!channel || channel.type !== "email") return NextResponse.json({ error: "Channel is not Email" }, { status: 400 });
  if (!contact?.email) return NextResponse.json({ error: "Contact has no email" }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytesMatchMime(bytes, mime)) {
    return NextResponse.json({ error: "File content doesn't match its type." }, { status: 415 });
  }

  // Store in the private bucket so the agent inbox renders the attachment via the
  // authed /api/media proxy. The customer gets the bytes as an email attachment.
  const path = `${conv.id}/${randomUUID()}.${cfg.ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 502 });
  const mediaUrl = `/api/media/${BUCKET}/${path}`;

  // Threading off the latest inbound email on the conversation.
  const priorEmail = (lastInbound?.metadata as { email?: { subject?: string; references?: string[] } } | null)?.email;
  const inReplyTo = lastInbound?.email_message_id ?? undefined;
  const references = inReplyTo ? [...(priorEmail?.references ?? []), inReplyTo] : undefined;
  let subject = priorEmail?.subject ?? channel.name ?? "Message";
  if (!/^re:/i.test(subject)) subject = `Re: ${subject}`;

  const metadata = (channel.metadata ?? {}) as ChannelMetadata;
  const fromName = metadata.from_name ?? channel.name ?? "Xyra Chat";
  const fromAddress = channel.inbox_email ?? process.env.EMAIL_FROM_ADDRESS ?? "support@xyrachat.com";

  // Org signature (sanitized), appended like the text send route.
  let signatureHtml: string | null = null;
  {
    const { data: org } = await admin.from("organizations").select("email_signature").eq("id", conv.org_id).maybeSingle();
    const raw = (org?.email_signature ?? "").trim();
    if (raw) signatureHtml = sanitizeEmailHtml(raw);
  }
  const safeName = (file.name ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const bodyHtml = caption
    ? textToHtml(caption)
    : `<div>${safeName ? `Attachment: ${safeName}` : "See attachment."}</div>`;
  const finalHtml = signatureHtml ? `${bodyHtml}<br><br>${signatureHtml}` : bodyHtml;

  const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN ?? "mail.xyrachat.com";
  const outboundMessageId = `<${randomUUID()}@${inboundDomain}>`;

  const sendRes = await new Resend(apiKey).emails.send({
    from: `${fromName} <${fromAddress}>`,
    to: contact.email,
    subject,
    html: finalHtml,
    ...(caption ? { text: caption } : {}),
    attachments: [{ filename: file.name || `attachment.${cfg.ext}`, content: Buffer.from(bytes) }],
    headers: {
      "Message-ID": outboundMessageId,
      ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
      ...(references && references.length ? { References: references.join(" ") } : {}),
    },
  });
  if (sendRes.error) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: sendRes.error.message }, { status: 502 });
  }

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
      email_message_id: outboundMessageId,
      metadata: {
        ...(file.name ? { media_filename: file.name } : {}),
        email: {
          subject,
          from_address: fromAddress,
          from_name: fromName,
          to_addresses: [contact.email],
          message_id: outboundMessageId,
          in_reply_to: inReplyTo,
          references,
        },
        resend_id: sendRes.data?.id ?? null,
      },
    })
    .select("*")
    .single();
  if (insertErr) {
    console.error("[email send-media] sent but failed to save locally", insertErr);
  }

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
