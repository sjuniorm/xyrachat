import { NextResponse, after, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import type { MessageStatus } from "@/lib/db-types";
import { runBotGate } from "@/lib/ai/bot-gate";
import { maybeAutoTranslate } from "@/lib/ai/auto-translate";
import { dispatchTrigger } from "@/lib/automations/triggers";
import { resumeWaitingReplies, runButtonTap } from "@/lib/automations/executor";
import { emit } from "@/lib/api/emit";
import { notifyNewInbound } from "@/lib/push/notify";

// Node runtime — we need `crypto` for HMAC.
export const runtime = "nodejs";

const META_GRAPH_VERSION = "v22.0";

// =====================================================================
// GET — webhook verification handshake (Meta calls this once at setup).
// Uses a separate verify token from WhatsApp so we can rotate them
// independently if either ever leaks.
// =====================================================================
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return new NextResponse("Webhook verify token not configured", { status: 500 });
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// =====================================================================
// POST — incoming webhook events.
// =====================================================================
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");
  const signatureOk = verifyMetaSignature(rawBody, signatureHeader);

  const admin = createAdminClient();

  if (!signatureOk) {
    try {
      await admin.from("webhook_log").insert({
        provider: "instagram",
        signature_ok: false,
        payload: { _raw: rawBody.slice(0, 4000) },
      });
    } catch {
      // never block the 401
    }
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: IgWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as IgWebhookPayload;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  try {
    await admin.from("webhook_log").insert({
      provider: "instagram",
      signature_ok: true,
      payload,
    });
  } catch {
    // never block the 200
  }

  if (payload.object !== "instagram") {
    return NextResponse.json({ received: true });
  }

  try {
    await processPayload(payload);
  } catch (err) {
    console.error("[instagram webhook] processing failed", err);
    // Still ack — webhook_log holds the raw payload for manual replay.
  }

  return NextResponse.json({ received: true });
}

// =====================================================================
// HMAC verification — uses the Instagram-specific app's secret, since
// the IG product lives in its own Meta app ("Xyra Chat-IG"), not the
// original WhatsApp app. Falls back to META_APP_SECRET only as a temporary
// bridge for any preview env that hasn't moved the secret yet.
// =====================================================================
function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const igSecret = process.env.INSTAGRAM_APP_SECRET;
  const secret = igSecret ?? process.env.META_APP_SECRET;
  if (!secret) return false;
  if (!igSecret) {
    // A single-app setup (IG product on the WhatsApp app) legitimately shares
    // META_APP_SECRET. But if INSTAGRAM_APP_SECRET is simply MISSING while the
    // IG app uses a different secret, every inbound 401s here — silently. Log
    // the fallback so that misconfig is visible instead of looking like "no DMs".
    console.warn(
      "[ig webhook] INSTAGRAM_APP_SECRET unset — verifying with META_APP_SECRET fallback",
    );
  }
  const provided = header.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

// =====================================================================
// Payload types — only the fields we use.
// =====================================================================
type IgWebhookPayload = {
  object: string;
  entry: Array<{
    id: string; // IG Business Account ID for messaging events
    time?: number;
    messaging?: IgMessagingEvent[];
    changes?: Array<{ field: string; value: unknown }>;
  }>;
};

type IgMessagingEvent = {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  // One of these will be set per event:
  message?: IgInboundMessage;
  reaction?: IgReaction;
  read?: { mid?: string };
  delivery?: { mids?: string[] };
};

type IgInboundMessage = {
  mid: string;
  text?: string;
  is_echo?: boolean;
  is_deleted?: boolean;
  // Set when the user taps a quick-reply button — payload carries our routing
  // token: xyra_btn:<automationId>:<buttonId> (opt-in tap) or
  // xyra_btn2:<automationId>:<buttonId> (a gate's confirm tap). Both UUIDs, so
  // exactly 3 colon-separated parts.
  quick_reply?: { payload?: string };
  reply_to?: { mid: string } | { story?: { id: string; url?: string } };
  attachments?: Array<{
    type: "image" | "video" | "audio" | "file" | "story_mention" | "share" | "ig_reel";
    payload?: { url?: string; sticker_id?: string };
  }>;
};

type IgReaction = {
  mid: string;
  action: "react" | "unreact";
  reaction?: string;
  emoji?: string;
};

// =====================================================================
// Processing
// =====================================================================
async function processPayload(payload: IgWebhookPayload) {
  for (const entry of payload.entry ?? []) {
    // entry.id is the IG Business Account id for messaging events.
    const channel = await findChannelByIgAccountId(entry.id);
    if (!channel) {
      console.warn(`[ig webhook] no channel for ig_business_account=${entry.id}`);
      continue;
    }

    for (const ev of entry.messaging ?? []) {
      // Skip echoes — these are our own outbound messages bounced back.
      if (ev.message?.is_echo) continue;
      if (ev.message?.is_deleted) continue;

      // Quick-reply (opt-in button) tap → run the button's follow-up actions.
      // The tap opened the messaging window, so the follow-up (e.g. the link)
      // is deliverable. Handle it here and SKIP normal inbound processing so the
      // button title isn't treated as a customer message (which would re-fire
      // keyword triggers or the bot on the tapped label).
      // xyra_btn:  = opt-in button tapped (may show a gate first)
      // xyra_btn2: = the gate's confirm button ("I followed!") tapped → deliver
      const qrPayload = ev.message?.quick_reply?.payload;
      if (qrPayload && /^xyra_btn2?:/.test(qrPayload)) {
        await handleButtonTap(channel, ev);
        continue;
      }

      if (ev.message) {
        await handleInbound(channel, ev);
      } else if (ev.reaction) {
        await handleReaction(ev);
      } else if (ev.read) {
        await handleStatus(ev.read.mid, "read");
      } else if (ev.delivery?.mids) {
        for (const mid of ev.delivery.mids) {
          await handleStatus(mid, "delivered");
        }
      }
    }

    // Non-messaging changes — comments, mentions, story_insights.
    // Subscribed via the Instagram webhook configuration in Meta App.
    for (const change of entry.changes ?? []) {
      try {
        await handleChange(channel, change);
      } catch (err) {
        console.error("[ig webhook] change handler failed", err);
      }
    }
  }
}

// =====================================================================
// Comment / mention events — trigger surface for automations.
// Meta sends these under `entry.changes` when the IG webhook is
// subscribed to `comments` / `mentions` fields on the app. Comment
// authors are external IG users; we treat them as contacts the same
// way DMs do so the inbox + automations have a consistent target.
// =====================================================================
type IgCommentChange = {
  field: "comments";
  value: {
    id: string; // comment id
    from?: { id: string; username?: string };
    text?: string;
    media?: { id: string; media_product_type?: string };
  };
};

// A user tapped a Xyra opt-in quick-reply button. Decode the routing token and
// run that button's follow-up actions (e.g. send the link). The tap opened the
// messaging window, so the follow-up is deliverable as a normal message.
async function handleButtonTap(channel: IgChannel, ev: IgMessagingEvent) {
  const senderId = ev.sender?.id;
  const payload = ev.message?.quick_reply?.payload ?? "";
  // payload = <prefix>:<automationId>:<buttonId>  (UUIDs — no colons inside)
  //   prefix "xyra_btn"  → initial opt-in tap (may send a gate first)
  //   prefix "xyra_btn2" → the gate's confirm tap → deliver the button's `then`
  const parts = payload.split(":");
  if (parts.length !== 3 || !senderId) {
    // A pre-deploy button (old 4-part payload) or a malformed token: log so a
    // tap that silently does nothing is observable rather than invisible.
    console.warn(`[ig webhook] unrecognized button payload "${payload}"`);
    return;
  }
  const prefix = parts[0];
  const automationId = parts[1];
  const buttonId = parts[2];
  if (!automationId || !buttonId) return;
  const contactId = await findOrCreateContact(channel, senderId);
  if (!contactId) return;

  // Store the tap as a VISIBLE inbound message so the inbox thread mirrors the
  // real IG conversation (opt-in prompt → "Send me the link" → link). We do NOT
  // run auto-translate / bot gate / keyword triggers on it — it's a button
  // confirmation, not a fresh customer message (that's why the caller skips
  // handleInbound). Idempotent on the IG mid, so a redelivered tap won't dupe.
  const admin = createAdminClient();
  const tapText = ev.message?.text?.trim();
  const mid = ev.message?.mid;
  let conversationId: string | null = null;
  if (mid && tapText) {
    const conv = await findOrCreateConversation(channel.org_id, channel.id, contactId);
    conversationId = conv.id;
    if (conversationId) {
      const { data: insertedId } = await admin.rpc("insert_inbound_ig_message", {
        p_conversation_id: conversationId,
        p_content: tapText,
        p_media_url: null,
        p_media_type: null,
        p_ig_message_id: mid,
        p_replied_to_message_id: null,
        p_metadata: { quick_reply: true },
        p_created_at: new Date(ev.timestamp).toISOString(),
      });
      if (insertedId) {
        await admin
          .from("conversations")
          .update({
            last_message_at: new Date().toISOString(),
            last_inbound_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      }
    }
  }

  await runButtonTap({
    automationId,
    buttonId,
    contactId,
    channelId: channel.id,
    // Reuse the conversation we just resolved so the gate/then idempotency
    // stamps key off the same row (no second find-or-create on this path).
    conversationId,
    stage: prefix === "xyra_btn2" ? "gate" : "initial",
  });
}

async function handleChange(
  channel: IgChannel,
  change: { field: string; value: unknown },
) {
  if (change.field === "comments") {
    const v = (change as IgCommentChange).value;
    const senderId = v.from?.id;
    if (!senderId || !v.text) return;
    const contactId = await findOrCreateContact(channel, senderId);
    if (!contactId) return;
    // after() keeps the serverless function alive to finish the reply AFTER the
    // 200 is sent — without it (bare `void`) Vercel freezes the instance the
    // moment we respond, so the comment-reply send only runs when the instance
    // is next thawed (the multi-second-to-minutes delay). after() runs it
    // promptly (~1-2s) while still acking Meta immediately.
    after(() =>
      dispatchTrigger({
        channel,
        contactId,
        triggerType: "ig_comment_keyword",
        matchText: v.text,
        postId: v.media?.id ?? null,
        triggerData: {
          comment_id: v.id,
          comment_text: v.text,
          post_id: v.media?.id,
          username: v.from?.username,
        },
      }),
    );
    return;
  }
  // Other change types (mentions, story_insights) are no-ops for now —
  // story mentions still come through the messaging path with
  // attachment.type === 'story_mention', and we dispatch there.
}

async function findChannelByIgAccountId(igAccountId: string) {
  const admin = createAdminClient();
  // Primary lookup: webhook-side IG Business Account ID matches what we stored.
  const direct = await admin
    .from("channels")
    .select("id, org_id, type, page_id, ig_business_account_id, access_token_vault_id, auto_translate_inbound, auto_translate_target_lang")
    .eq("ig_business_account_id", igAccountId)
    .eq("type", "instagram")
    .is("deleted_at", null)
    .maybeSingle();
  if (direct.data) return direct.data;

  // Fallback: Instagram Business Login's /me returns an ID in a DIFFERENT
  // format than what Meta sends in webhook payloads. We stash the /me id
  // in metadata.ig_login_user_id during OAuth; the FIRST webhook teaches us
  // the mapping. We migrate the channel in place so future lookups are
  // O(1) on the primary column.
  const fallback = await admin
    .from("channels")
    .select("id, org_id, type, page_id, ig_business_account_id, access_token_vault_id, metadata, auto_translate_inbound, auto_translate_target_lang")
    .eq("metadata->>ig_login_user_id", igAccountId)
    .eq("type", "instagram")
    .is("deleted_at", null)
    .maybeSingle();
  if (fallback.data) {
    await admin
      .from("channels")
      .update({ ig_business_account_id: igAccountId })
      .eq("id", fallback.data.id);
    return fallback.data;
  }

  return null;
}

type IgChannel = NonNullable<Awaited<ReturnType<typeof findChannelByIgAccountId>>>;

async function fetchContactProfile(
  channel: IgChannel,
  igUserId: string,
): Promise<{ name: string | null; avatar_url: string | null }> {
  // Cheap best-effort — if we can't get the token or the lookup fails, fall
  // back to nulls. The webhook must still return 200 quickly.
  if (!channel.access_token_vault_id) return { name: null, avatar_url: null };
  try {
    const token = await vaultReadSecret(channel.access_token_vault_id);
    if (!token) return { name: null, avatar_url: null };
    // IG-direct (Instagram Business Login, no linked Page) profiles must be read
    // from graph.instagram.com — the IG-user token is NOT valid on
    // graph.facebook.com, so the FB host silently returned null name/avatar for
    // every IG-direct contact. Page-linked channels still use the Graph host.
    // Token in the Authorization header, NOT the URL query string (a token in
    // the URL leaks into proxy/access logs). Matches the IG send route.
    const base = channel.page_id ? "graph.facebook.com" : "graph.instagram.com";
    const url = `https://${base}/${META_GRAPH_VERSION}/${igUserId}?fields=name,profile_pic`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { name: null, avatar_url: null };
    const j = (await res.json()) as { name?: string; profile_pic?: string };
    return { name: j.name ?? null, avatar_url: j.profile_pic ?? null };
  } catch {
    return { name: null, avatar_url: null };
  }
}

async function findOrCreateContact(
  channel: IgChannel,
  igUserId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const existing = await admin
    .from("contacts")
    .select("id, name, avatar_url")
    .eq("org_id", channel.org_id)
    .eq("instagram_id", igUserId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing.data) {
    // Backfill name + avatar if we didn't have them before.
    if (!existing.data.name || !existing.data.avatar_url) {
      const profile = await fetchContactProfile(channel, igUserId);
      const patch: Record<string, string> = {};
      if (!existing.data.name && profile.name) patch.name = profile.name;
      if (!existing.data.avatar_url && profile.avatar_url) {
        patch.avatar_url = profile.avatar_url;
      }
      if (Object.keys(patch).length > 0) {
        await admin.from("contacts").update(patch).eq("id", existing.data.id);
      }
    }
    return existing.data.id;
  }

  const profile = await fetchContactProfile(channel, igUserId);
  const { data } = await admin
    .from("contacts")
    .insert({
      org_id: channel.org_id,
      instagram_id: igUserId,
      name: profile.name,
      avatar_url: profile.avatar_url,
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function findOrCreateConversation(
  orgId: string,
  channelId: string,
  contactId: string,
): Promise<{ id: string | null; created: boolean }> {
  const admin = createAdminClient();
  // Reopen closed/snoozed threads on new inbound — see WA webhook for
  // the rationale (continuous conversation history per contact).
  const existing = await admin
    .from("conversations")
    .select("id, status")
    .eq("channel_id", channelId)
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.data) {
    if (existing.data.status === "closed" || existing.data.status === "snoozed") {
      await admin
        .from("conversations")
        .update({ status: "open", snooze_until: null })
        .eq("id", existing.data.id);
    }
    return { id: existing.data.id, created: false };
  }
  const { data } = await admin
    .from("conversations")
    .insert({ org_id: orgId, channel_id: channelId, contact_id: contactId })
    .select("id")
    .single();
  return { id: data?.id ?? null, created: Boolean(data?.id) };
}

function extractContent(msg: IgInboundMessage): {
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  metadata: Record<string, unknown>;
} {
  const meta: Record<string, unknown> = {};

  // Story-mention / story-reply context comes through reply_to.
  if (msg.reply_to && "story" in msg.reply_to && msg.reply_to.story) {
    meta.ig_story = {
      id: msg.reply_to.story.id,
      url: msg.reply_to.story.url ?? null,
    };
  }

  const att = msg.attachments?.[0];
  if (att) {
    const url = att.payload?.url ?? null;
    switch (att.type) {
      case "story_mention":
        return {
          content: msg.text ?? "Mentioned you in a story",
          media_url: url,
          media_type: "story_mention",
          metadata: meta,
        };
      case "image":
        return { content: msg.text ?? null, media_url: url, media_type: "image", metadata: meta };
      case "video":
        return { content: msg.text ?? null, media_url: url, media_type: "video", metadata: meta };
      case "audio":
        return { content: msg.text ?? null, media_url: url, media_type: "audio", metadata: meta };
      case "ig_reel":
        return {
          content: msg.text ?? "Shared a reel",
          media_url: url,
          media_type: "ig_reel",
          metadata: meta,
        };
      case "share":
        return {
          content: msg.text ?? "Shared a post",
          media_url: url,
          media_type: "share",
          metadata: meta,
        };
      case "file":
        return { content: msg.text ?? null, media_url: url, media_type: "file", metadata: meta };
      default:
        return { content: msg.text ?? null, media_url: url, media_type: att.type, metadata: meta };
    }
  }

  return { content: msg.text ?? null, media_url: null, media_type: null, metadata: meta };
}

async function handleInbound(channel: IgChannel, ev: IgMessagingEvent) {
  const msg = ev.message!;
  const admin = createAdminClient();

  const contactId = await findOrCreateContact(channel, ev.sender.id);
  if (!contactId) {
    console.error(`[ig webhook] failed to find/create contact for ${ev.sender.id}`);
    return;
  }

  const { id: conversationId, created: wasNewConversation } =
    await findOrCreateConversation(channel.org_id, channel.id, contactId);
  if (!conversationId) return;

  // reply_to.mid points at one of our previous outbound messages — look up
  // by ig_message_id to set the reply chain.
  let repliedToId: string | null = null;
  if (msg.reply_to && "mid" in msg.reply_to && msg.reply_to.mid) {
    const { data: replied } = await admin
      .from("messages")
      .select("id")
      .eq("ig_message_id", msg.reply_to.mid)
      .maybeSingle();
    repliedToId = replied?.id ?? null;
  }

  const extracted = extractContent(msg);

  const { data: insertedId, error: insertErr } = await admin.rpc(
    "insert_inbound_ig_message",
    {
      p_conversation_id: conversationId,
      p_content: extracted.content,
      p_media_url: extracted.media_url,
      p_media_type: extracted.media_type,
      p_ig_message_id: msg.mid,
      p_replied_to_message_id: repliedToId,
      p_metadata: extracted.metadata,
      p_created_at: new Date(ev.timestamp).toISOString(),
    },
  );

  if (insertErr) {
    console.error("[ig webhook] insert_inbound_ig_message failed", insertErr);
    return;
  }
  if (!insertedId) return; // Meta retry — already stored.

  await admin
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_inbound_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (extracted.content) {
    await maybeAutoTranslate({
      channel: {
        id: channel.id,
        type: channel.type,
        auto_translate_inbound: (channel as { auto_translate_inbound?: boolean | null }).auto_translate_inbound,
        auto_translate_target_lang: (channel as { auto_translate_target_lang?: string | null }).auto_translate_target_lang,
      },
      orgId: channel.org_id,
      contactId,
      messageId: insertedId,
      content: extracted.content,
    });
  }

  after(() =>
    emit({
      type: "message.received",
      orgId: channel.org_id,
      data: {
        id: insertedId,
        conversation_id: conversationId,
        contact_id: contactId,
        channel_id: channel.id,
        channel_type: channel.type,
        direction: "inbound",
        content: extracted.content,
        media_type: extracted.media_type,
        created_at: new Date(ev.timestamp).toISOString(),
      },
    }),
  );
  if (wasNewConversation) {
    after(() =>
      emit({
        type: "conversation.opened",
        orgId: channel.org_id,
        data: {
          id: conversationId,
          contact_id: contactId,
          channel_id: channel.id,
          channel_type: channel.type,
        },
      }),
    );
  }
  // Wake the assigned agent's mobile device(s). after() so it isn't frozen.
  after(() =>
    notifyNewInbound({
      conversationId,
      channelType: channel.type,
      preview: extracted.content,
    }),
  );
  await runBotGate({
    channel: { id: channel.id, type: channel.type, org_id: channel.org_id },
    conversationId,
    contactId,
    newMessage: {
      content: extracted.content,
      media_type: extracted.media_type,
      isFirstFromContact: false,
      media_url: extracted.media_url,
      messageId: insertedId,
    },
  });

  // Resume any automation parked on a wait_for_reply for this conversation
  // (any inbound counts as the reply, media included).
  after(() =>
    resumeWaitingReplies(conversationId, extracted.content ?? "").catch((err) => {
      console.error("[ig] resumeWaitingReplies failed", err);
    }),
  );

  // Automation triggers — run after the 200 (via after(), so they finish
  // promptly instead of being frozen) and after the bot gate above.
  if (extracted.content) {
    after(() =>
      dispatchTrigger({
        channel,
        contactId,
        triggerType: "ig_dm_keyword",
        matchText: extracted.content!,
        conversationId,
        triggerData: { ig_message_id: msg.mid, text: extracted.content },
      }),
    );
  }
  if (extracted.media_type === "story_mention") {
    after(() =>
      dispatchTrigger({
        channel,
        contactId,
        triggerType: "ig_story_mention",
        conversationId,
        triggerData: { ig_message_id: msg.mid },
      }),
    );
  }
}

async function handleReaction(ev: IgMessagingEvent) {
  const r = ev.reaction!;
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("messages")
    .select("id, metadata")
    .eq("ig_message_id", r.mid)
    .maybeSingle();
  if (!target) return;
  const prevMetadata = (target.metadata ?? {}) as Record<string, unknown>;
  const reactions = Array.isArray(prevMetadata.ig_reactions)
    ? (prevMetadata.ig_reactions as Array<{ from: string; emoji: string }>)
    : [];
  if (r.action === "react" && r.emoji) {
    reactions.push({ from: ev.sender.id, emoji: r.emoji });
  } else if (r.action === "unreact") {
    const idx = reactions.findIndex((x) => x.from === ev.sender.id);
    if (idx >= 0) reactions.splice(idx, 1);
  }
  await admin
    .from("messages")
    .update({ metadata: { ...prevMetadata, ig_reactions: reactions } })
    .eq("id", target.id);
}

async function handleStatus(
  mid: string | undefined,
  next: "delivered" | "read",
) {
  if (!mid) return;
  const admin = createAdminClient();
  const order: Record<MessageStatus, number> = {
    sent: 0,
    delivered: 1,
    read: 2,
    failed: 3,
  };
  const { data: current } = await admin
    .from("messages")
    .select("id, status")
    .eq("ig_message_id", mid)
    .maybeSingle();
  if (!current) return;
  if (order[next] > order[current.status as MessageStatus]) {
    await admin.from("messages").update({ status: next }).eq("id", current.id);
  }
}
