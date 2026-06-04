"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transcribeInboundAudio } from "@/lib/ai/transcription";
import { checkAiQuota, consumeAiTokens } from "@/lib/billing/usage";

type ActionResult = { ok: true; text: string } | { ok: false; error: string };

// On-demand transcription of an inbound voice note, triggered by an agent from
// the inbox (works regardless of whether a bot is assigned). Same Whisper
// pipeline as the bot gate; charges the org AI budget.
export async function transcribeMessage(messageId: string): Promise<ActionResult> {
  if (!messageId) return { ok: false, error: "Missing message id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: me } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.org_id) return { ok: false, error: "Not in an org." };

  const admin = createAdminClient();
  const { data: msg } = await admin
    .from("messages")
    .select("id, conversation_id, media_type, media_url, content, metadata")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { ok: false, error: "Message not found." };

  // TENANT CHECK FIRST — the admin client bypasses RLS, so we MUST confirm the
  // message belongs to the caller's org BEFORE returning any of its content
  // (including an already-cached transcript). A generic "not found" for the
  // cross-org case avoids leaking that the message id exists in another tenant.
  const { data: conv } = await admin
    .from("conversations")
    .select("org_id, channel_id")
    .eq("id", msg.conversation_id)
    .maybeSingle();
  if (!conv || conv.org_id !== me.org_id) {
    return { ok: false, error: "Message not found." };
  }

  if (msg.media_type !== "audio" || !msg.media_url) {
    return { ok: false, error: "This message has no voice note to transcribe." };
  }
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  const existing = (meta.transcription as { text?: string } | undefined)?.text;
  if (existing) return { ok: true, text: existing }; // already transcribed (org verified above)

  const { data: channel } = await admin
    .from("channels")
    .select("id, type")
    .eq("id", conv.channel_id)
    .maybeSingle();
  if (!channel) return { ok: false, error: "Channel not found." };

  const quota = await checkAiQuota(me.org_id);
  if (!quota.ok) {
    return {
      ok: false,
      error: "Your workspace has used all of its AI tokens this month.",
    };
  }

  const tr = await transcribeInboundAudio({
    channelType: channel.type ?? "",
    channelId: channel.id,
    mediaRef: msg.media_url,
    admin,
  });
  if (!tr) {
    return {
      ok: false,
      error:
        "Couldn't transcribe this voice note — it may have expired or be an unsupported format.",
    };
  }

  // Atomic, idempotent persist (server-side JSONB merge). Charge only if we
  // were the writer — the bot gate may have transcribed the same note first.
  const { data: wroteId } = await admin.rpc("set_message_transcription", {
    p_message_id: messageId,
    p_text: tr.text,
    p_model: tr.model,
  });
  if (wroteId) {
    await consumeAiTokens(me.org_id, tr.budgetTokens);
  }

  revalidatePath(`/inbox/${msg.conversation_id}`);
  return { ok: true, text: tr.text };
}
