import { NextResponse, type NextRequest } from "next/server";
import { dispatchTrigger } from "@/lib/automations/triggers";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeEmailHtml } from "@/lib/security/sanitize";

export const runtime = "nodejs";

// Resend forwards inbound email here as JSON. Resend uses Svix for webhook
// delivery, so signatures arrive as:
//   svix-id:        unique id for the message
//   svix-timestamp: unix seconds at send time
//   svix-signature: "v1,<base64-hmac>" (sometimes multiple "v1," entries)
//
// Verification: signed_content = `${svix-id}.${svix-timestamp}.${rawBody}`,
// HMAC-SHA256 with the webhook signing secret (base64-decoded — Resend
// emits secrets in "whsec_<base64>" form).
//
// Threading: we resolve which conversation an inbound email belongs to via
// the In-Reply-To / References headers. Those reference Message-Ids of
// emails we sent earlier — stored on messages.email_message_id.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTs = req.headers.get("svix-timestamp");
  const svixSig = req.headers.get("svix-signature");

  const admin = createAdminClient();
  const sigOk = verifyResendSignature(rawBody, svixId, svixTs, svixSig);
  if (!sigOk) {
    try {
      await admin.from("webhook_log").insert({
        provider: "email",
        signature_ok: false,
        payload: { _raw: rawBody.slice(0, 4000) },
      });
    } catch {
      // never block 401
    }
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: ResendWebhookEvent;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  try {
    await admin.from("webhook_log").insert({
      provider: "email",
      signature_ok: true,
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch {
    // never block 200
  }

  // Only handle inbound — Resend uses event.type to discriminate.
  if (payload.type !== "email.received" || !payload.data) {
    return NextResponse.json({ received: true });
  }

  try {
    await handleInbound(payload.data);
  } catch (err) {
    console.error("[email webhook] processing failed", err);
  }

  return NextResponse.json({ received: true });
}

// =====================================================================
// Signature verification (Svix-format)
// =====================================================================
function verifyResendSignature(
  rawBody: string,
  svixId: string | null,
  svixTs: string | null,
  svixSig: string | null,
): boolean {
  if (!svixId || !svixTs || !svixSig) return false;
  const secretEnv = process.env.RESEND_WEBHOOK_SECRET;
  if (!secretEnv) return false;
  const secretB64 = secretEnv.startsWith("whsec_") ? secretEnv.slice(6) : secretEnv;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secretB64, "base64");
  } catch {
    return false;
  }

  const signedContent = `${svixId}.${svixTs}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest();

  // The header can carry multiple `vN,<sig>` pairs separated by spaces.
  // Accept the first v1 entry that matches.
  for (const entry of svixSig.split(" ")) {
    const [version, b64] = entry.split(",");
    if (version !== "v1" || !b64) continue;
    let provided: Buffer;
    try {
      provided = Buffer.from(b64, "base64");
    } catch {
      continue;
    }
    if (
      provided.length === expected.length &&
      timingSafeEqual(provided, expected)
    ) {
      return true;
    }
  }
  return false;
}

// =====================================================================
// Payload subset
// =====================================================================
type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: ResendInboundEmail;
};

type ResendInboundEmail = {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  headers?: Array<{ name: string; value: string }>;
  attachments?: Array<{ filename?: string; url?: string; content_type?: string }>;
};

// =====================================================================
// Processing
// =====================================================================
async function handleInbound(email: ResendInboundEmail) {
  const admin = createAdminClient();
  const toAddresses = email.to.map(normalizeAddress);
  const fromAddress = normalizeAddress(email.from);
  const fromName = extractDisplayName(email.from);

  // 1. Match channel by the to-address. Each org has one inbound address.
  const channel = await findChannelByInboxEmail(toAddresses);
  if (!channel) {
    console.warn(`[email webhook] no channel for to=${toAddresses.join(",")}`);
    return;
  }

  // 2. Pull RFC 5322 thread headers.
  const messageId = headerValue(email.headers, "message-id");
  const inReplyTo = headerValue(email.headers, "in-reply-to");
  const referencesRaw = headerValue(email.headers, "references");
  const references = referencesRaw
    ? referencesRaw.split(/\s+/).filter(Boolean)
    : [];

  // 3. Resolve which conversation this belongs to.
  //    Priority: In-Reply-To match > any References match > open conversation
  //    with same contact > create fresh.
  const contactId = await findOrCreateContact(
    channel.org_id,
    fromAddress,
    fromName,
  );
  if (!contactId) return;

  let conversationId: string | null = null;
  let repliedToId: string | null = null;
  const candidateIds = [inReplyTo, ...references].filter(
    (x): x is string => Boolean(x),
  );
  if (candidateIds.length > 0) {
    const { data: prior } = await admin
      .from("messages")
      .select("id, conversation_id")
      .in("email_message_id", candidateIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior) {
      conversationId = prior.conversation_id;
      if (inReplyTo === (prior as { email_message_id?: string }).email_message_id) {
        repliedToId = prior.id;
      } else {
        repliedToId = prior.id;
      }
    }
  }
  if (!conversationId) {
    conversationId = await findOrCreateOpenConversation(
      channel.org_id,
      channel.id,
      contactId,
    );
  }
  if (!conversationId) return;

  const content = email.text ?? stripHtml(email.html ?? "");
  const meta: Record<string, unknown> = {
    email: {
      subject: email.subject,
      from_address: fromAddress,
      from_name: fromName,
      to_addresses: toAddresses,
      cc_addresses: email.cc?.map(normalizeAddress),
      // Sanitize untrusted sender HTML before storing (stored-XSS defense) —
      // it's surfaced via the API + may be rendered by future clients.
      html_body: email.html ? sanitizeEmailHtml(email.html) : undefined,
      in_reply_to: inReplyTo ?? undefined,
      references: references.length > 0 ? references : undefined,
    },
  };

  const { data: insertedId, error: insertErr } = await admin.rpc(
    "insert_inbound_email_message",
    {
      p_conversation_id: conversationId,
      p_content: content,
      p_email_message_id: messageId ?? null,
      p_replied_to_message_id: repliedToId,
      p_metadata: meta,
      p_created_at: new Date().toISOString(),
    },
  );
  if (insertErr) {
    console.error("[email webhook] insert_inbound_email_message failed", insertErr);
    return;
  }
  if (!insertedId) return; // duplicate Message-Id — already stored

  await admin
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_inbound_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  // Automation triggers — email_keyword (matches against subject + body)
  // + conversation_opened (one-shot per (automation, contact)).
  const matchText = `${email.subject ?? ""}\n${content}`.trim();
  if (matchText) {
    void dispatchTrigger({
      channel: {
        id: channel.id,
        type: channel.type,
        org_id: channel.org_id,
      },
      contactId,
      triggerType: "email_keyword",
      matchText,
      conversationId,
      triggerData: {
        email_message_id: messageId,
        subject: email.subject,
      },
    });
  }
  void dispatchTrigger({
    channel: {
      id: channel.id,
      type: channel.type,
      org_id: channel.org_id,
    },
    contactId,
    triggerType: "conversation_opened",
    conversationId,
    triggerData: { email_message_id: messageId },
  });
}

// =====================================================================
// Helpers
// =====================================================================
function normalizeAddress(raw: string): string {
  const angle = raw.match(/<([^>]+)>/);
  return (angle ? angle[1] : raw).trim().toLowerCase();
}

function extractDisplayName(raw: string): string | null {
  // "Alice <alice@example.com>" -> "Alice"
  const m = raw.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  if (m) return m[1].trim() || null;
  return null;
}

function headerValue(
  headers: ResendInboundEmail["headers"],
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h.name.toLowerCase() === lower) return h.value;
  }
  return undefined;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function findChannelByInboxEmail(toAddresses: string[]) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("channels")
    .select("id, org_id, type, inbox_email")
    .in("inbox_email", toAddresses)
    .eq("type", "email")
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

async function findOrCreateContact(
  orgId: string,
  email: string,
  name: string | null,
): Promise<string | null> {
  const admin = createAdminClient();
  const existing = await admin
    .from("contacts")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing.data) {
    if (!existing.data.name && name) {
      await admin.from("contacts").update({ name }).eq("id", existing.data.id);
    }
    return existing.data.id;
  }
  const { data } = await admin
    .from("contacts")
    .insert({ org_id: orgId, email, name })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function findOrCreateOpenConversation(
  orgId: string,
  channelId: string,
  contactId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const existing = await admin
    .from("conversations")
    .select("id")
    .eq("channel_id", channelId)
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .neq("status", "closed")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.data) return existing.data.id;
  const { data } = await admin
    .from("conversations")
    .insert({ org_id: orgId, channel_id: channelId, contact_id: contactId })
    .select("id")
    .single();
  return data?.id ?? null;
}
