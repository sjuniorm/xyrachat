import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getRouteUser } from "@/lib/supabase/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import type { ChannelMetadata } from "@/lib/db-types";

export const runtime = "nodejs";

type SendBody = {
  conversationId: string;
  content?: string;
  htmlBody?: string;
  // ID of an inbound message we're replying to; we read its
  // email_message_id + metadata.email.subject to populate threading headers.
  repliedToMessageId?: string;
};

export async function POST(req: Request) {
  // Auth (web session cookie OR mobile JWT).
  const { supabase, user } = await getRouteUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = await rateLimit("channel:send:email", user.id, { limit: 120, windowSec: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Slow down — too many messages." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { conversationId, content, htmlBody } = body;
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }
  if (!content?.trim() && !htmlBody?.trim()) {
    return NextResponse.json({ error: "content or htmlBody required" }, { status: 400 });
  }

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
    admin
      .from("channels")
      .select("id, type, inbox_email, metadata, name")
      .eq("id", conv.channel_id)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("id, email, name")
      .eq("id", conv.contact_id)
      .maybeSingle(),
  ]);
  if (!channel || channel.type !== "email") {
    return NextResponse.json({ error: "Channel is not Email" }, { status: 400 });
  }
  if (!contact?.email) {
    return NextResponse.json({ error: "Contact has no email" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  // Resolve threading headers + subject from the replied-to inbound row.
  let inReplyTo: string | undefined;
  let references: string[] | undefined;
  let subject = `Re: ${channel.name}`;
  if (body.repliedToMessageId) {
    // Scope through the caller's conversation so a guessed message UUID
    // from another org can't leak its email subject / Message-Id /
    // References (and can't hijack another org's email thread either).
    const { data: replied } = await admin
      .from("messages")
      .select("email_message_id, metadata")
      .eq("id", body.repliedToMessageId)
      .eq("conversation_id", conv.id)
      .maybeSingle();
    if (replied?.email_message_id) {
      inReplyTo = replied.email_message_id;
      const prev =
        (replied.metadata as { email?: { references?: string[]; subject?: string } } | null)
          ?.email;
      references = [
        ...(prev?.references ?? []),
        replied.email_message_id,
      ];
      if (prev?.subject) {
        subject = prev.subject.match(/^re:/i)
          ? prev.subject
          : `Re: ${prev.subject}`;
      }
    }
  }

  const metadata = (channel.metadata ?? {}) as ChannelMetadata;
  const fromName = metadata.from_name ?? "Xyra Chat";
  const fromAddress =
    channel.inbox_email ?? process.env.EMAIL_FROM_ADDRESS ?? "support@xyrachat.com";
  const fromLine = `${fromName} <${fromAddress}>`;

  const resend = new Resend(apiKey);
  const trimmedText = content?.trim();
  const trimmedHtml = htmlBody?.trim();
  // Resend's v6 type union requires either `text` or `html` to be present
  // as a string. Build the payload conditionally so TypeScript can pick
  // the right branch.
  const sendRes = await (trimmedHtml
    ? resend.emails.send({
        from: fromLine,
        to: contact.email,
        subject,
        html: trimmedHtml,
        ...(trimmedText ? { text: trimmedText } : {}),
        headers: {
          ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
          ...(references && references.length > 0
            ? { References: references.join(" ") }
            : {}),
        },
      })
    : resend.emails.send({
        from: fromLine,
        to: contact.email,
        subject,
        text: trimmedText ?? "",
        headers: {
          ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
          ...(references && references.length > 0
            ? { References: references.join(" ") }
            : {}),
        },
      }));

  if (sendRes.error) {
    return NextResponse.json(
      { error: sendRes.error.message, provider: sendRes.error },
      { status: 502 },
    );
  }

  // Resend returns its own `id`. The actual outbound Message-Id header is
  // generated server-side by Resend and isn't returned here — for threading
  // we rely on inbound replies carrying In-Reply-To referencing whatever
  // Resend sent. We stash the Resend id in metadata for traceability.
  const resendId = sendRes.data?.id ?? null;

  const { data: stored, error: insertErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conv.id,
      direction: "outbound",
      content: content?.trim() ?? null,
      sender_type: "agent",
      sender_id: user.id,
      status: "sent",
      replied_to_message_id: body.repliedToMessageId ?? null,
      metadata: {
        email: {
          subject,
          from_address: fromAddress,
          from_name: fromName,
          to_addresses: [contact.email],
          html_body: htmlBody?.trim() || undefined,
          in_reply_to: inReplyTo,
          references,
        },
        resend_id: resendId,
      },
    })
    .select("*")
    .single();
  if (insertErr) {
    console.error("[email send] sent but failed to save locally", insertErr);
  }

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  return NextResponse.json({ message: stored ?? null, resend_id: resendId });
}
