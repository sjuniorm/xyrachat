import "server-only";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOutbound } from "@/lib/ai/bot-gate";

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://xyra-chat.vercel.app";
}

// Fire a CSAT/NPS survey when a conversation is closed, IF the org enabled it.
// Creates a rating request + messages the customer a link. Best-effort: any
// failure (no survey configured, no pending slot, send error) is swallowed so
// closing a conversation never breaks. Idempotent via the pending unique index.
export async function maybeSendSurvey(conversationId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: conv } = await admin
      .from("conversations")
      .select("id, org_id, channel_id, contact_id, last_inbound_at")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv?.org_id || !conv.channel_id || !conv.contact_id) return;

    const { data: org } = await admin
      .from("organizations")
      .select("survey_kind")
      .eq("id", conv.org_id)
      .maybeSingle();
    const kind = org?.survey_kind as "off" | "csat" | "nps" | undefined;
    if (!kind || kind === "off") return;

    // Skip if a survey already went out for this conversation in the last 30
    // days — pending OR already rated. Without the rated case, closing a
    // conversation again after the customer rated would spam a fresh survey.
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: recent } = await admin
      .from("conversation_ratings")
      .select("id")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .gte("created_at", cutoff)
      .limit(1)
      .maybeSingle();
    if (recent) return;

    const { data: channel } = await admin
      .from("channels")
      .select("type")
      .eq("id", conv.channel_id)
      .maybeSingle();
    if (!channel) return;

    // WhatsApp only allows free-form sends within 24h of the last inbound.
    // Outside it, a survey send would fail at Meta (and re-queue on each close),
    // so skip rather than fail-loop. (Template-based surveys are a follow-up.)
    if (channel.type === "whatsapp") {
      const lastIn = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
      if (!lastIn || Date.now() - lastIn > 24 * 60 * 60 * 1000) return;
    }

    const token = randomBytes(16).toString("hex");
    const { error: insErr } = await admin.from("conversation_ratings").insert({
      org_id: conv.org_id,
      conversation_id: conversationId,
      contact_id: conv.contact_id,
      channel_type: channel.type,
      kind,
      token,
    });
    if (insErr) return; // unique-index race: another close already queued one

    const link = `${appOrigin()}/rate/${token}`;
    const msg =
      kind === "nps"
        ? `Thanks for chatting with us! How likely are you to recommend us to a friend? ${link}`
        : `Thanks for chatting with us! How did we do? Rate your experience: ${link}`;

    await sendOutbound(channel.type, {
      conversationId,
      content: msg,
      botMetadata: { survey: true, survey_kind: kind },
      channelId: conv.channel_id,
      contactId: conv.contact_id,
    });
  } catch (err) {
    console.error("[surveys] maybeSendSurvey failed (continuing)", err);
  }
}
