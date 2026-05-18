import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";

export const runtime = "nodejs";

const IG_GRAPH_VERSION = "v22.0";

type SendBody = {
  conversationId: string;
  content?: string;
  imageUrl?: string;
  repliedToMessageId?: string;
};

export async function POST(req: Request) {
  // 1. Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { conversationId, content, imageUrl } = body;
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }
  if (!content?.trim() && !imageUrl) {
    return NextResponse.json(
      { error: "content or imageUrl required" },
      { status: 400 },
    );
  }

  // 2. Load conversation (RLS-scoped).
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, channel_id, contact_id, org_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // 3. Load channel + contact via admin client.
  const admin = createAdminClient();
  const [{ data: channel }, { data: contact }] = await Promise.all([
    admin
      .from("channels")
      .select("id, type, page_id, ig_business_account_id, access_token_vault_id, metadata")
      .eq("id", conv.channel_id)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("id, instagram_id")
      .eq("id", conv.contact_id)
      .maybeSingle(),
  ]);
  if (!channel || channel.type !== "instagram") {
    return NextResponse.json({ error: "Channel is not Instagram" }, { status: 400 });
  }
  if (!channel.access_token_vault_id) {
    return NextResponse.json(
      { error: "Channel is missing a token" },
      { status: 400 },
    );
  }
  if (!contact?.instagram_id) {
    return NextResponse.json(
      { error: "Contact has no instagram_id" },
      { status: 400 },
    );
  }

  // 4. Decrypt the access token from Vault.
  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) {
    return NextResponse.json({ error: "Token missing from vault" }, { status: 500 });
  }

  // 5. Pick send strategy. Two paths exist:
  //    - IG-direct (Instagram Business Login): no page_id, token is an IG
  //      user access token, send via graph.instagram.com/{ig_user_id}/messages
  //    - Facebook Login (Page-linked IG): page_id set, token is a Page
  //      access token, send via graph.facebook.com/{page_id}/messages
  //
  //    For IG-direct, the send endpoint expects the IG-Login user_id (what
  //    /me returns), NOT the IG Business Account ID that arrives in webhook
  //    payloads. After auto-heal, channels.ig_business_account_id holds the
  //    webhook-side ID, so we prefer metadata.ig_login_user_id when present.
  const useIgDirect = !channel.page_id && Boolean(channel.ig_business_account_id);
  const igLoginUserId =
    (channel.metadata as { ig_login_user_id?: string } | null)?.ig_login_user_id ??
    channel.ig_business_account_id;

  const url = useIgDirect
    ? `https://graph.instagram.com/${IG_GRAPH_VERSION}/${igLoginUserId}/messages`
    : `https://graph.facebook.com/${IG_GRAPH_VERSION}/${channel.page_id}/messages`;

  const messagePayload: Record<string, unknown> = imageUrl
    ? { attachment: { type: "image", payload: { url: imageUrl, is_reusable: false } } }
    : { text: content!.trim() };

  const igPayload = {
    recipient: { id: contact.instagram_id },
    messaging_type: "RESPONSE",
    message: messagePayload,
  };

  const metaRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(igPayload),
  });

  const metaJson = (await metaRes.json().catch(() => null)) as
    | {
        message_id?: string;
        recipient_id?: string;
        error?: { message: string; code?: number };
      }
    | null;

  if (!metaRes.ok || metaJson?.error) {
    return NextResponse.json(
      {
        error: metaJson?.error?.message ?? `Meta API error (HTTP ${metaRes.status})`,
        meta: metaJson,
      },
      { status: 502 },
    );
  }

  const igMessageId = metaJson?.message_id ?? null;

  // 6. Save outbound row locally so the inbox renders immediately.
  const { data: stored, error: insertErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conv.id,
      direction: "outbound",
      content: content?.trim() ?? null,
      media_url: imageUrl ?? null,
      media_type: imageUrl ? "image" : null,
      sender_type: "agent",
      sender_id: user.id,
      status: "sent",
      ig_message_id: igMessageId,
      replied_to_message_id: body.repliedToMessageId ?? null,
      metadata: {},
    })
    .select("*")
    .single();

  if (insertErr) {
    console.error("[ig send] sent to Meta but failed to save locally", insertErr);
  }

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  return NextResponse.json({ message: stored ?? null, ig_message_id: igMessageId });
}
