// Adapts DB rows into the legacy mock shape Week 2 components already use.
// Saves us from rewriting every component just because the data source changed.
// When we generate real Supabase types in Week 5, we can drop this and have
// the components consume MessageRow / ConversationWithRelations directly.

import type {
  Conversation as UiConversation,
  Message as UiMessage,
  AiActivity,
} from "@/lib/mock-data";
import type {
  ConversationWithRelations,
  MessageRow,
} from "@/lib/db-types";
import { languageLabel } from "@/lib/i18n/languages";

// Derive the "AI activity" provenance chips for a message from its metadata +
// sender. Order: translation (inbound), then automation OR bot reply (an
// automation send is sender_type='bot' too, so automation wins), then lead.
function deriveAiActivity(row: MessageRow): AiActivity[] {
  const m = row.metadata ?? {};
  const acts: AiActivity[] = [];
  if (m.auto_translation?.source) {
    acts.push({ kind: "translate", label: `Auto-translated from ${languageLabel(m.auto_translation.source)}` });
  }
  if (m.automation) {
    const name = m.automation_meta?.name;
    acts.push({ kind: "automation", label: name ? `Automated · ${name}` : "Automated" });
  } else if (row.sender_type === "bot") {
    const parts: string[] = [];
    if (typeof m.sources_used === "number" && m.sources_used > 0) parts.push("from your knowledge");
    if (typeof m.latency_ms === "number" && m.latency_ms > 0) {
      const s = m.latency_ms / 1000;
      parts.push(s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`);
    }
    acts.push({ kind: "bot", label: parts.length ? `AI reply · ${parts.join(" · ")}` : "AI reply" });
  }
  if (Array.isArray(m.tools_invoked) && m.tools_invoked.includes("capture_lead")) {
    acts.push({ kind: "lead", label: "Lead captured" });
  }
  return acts;
}

function fallbackAvatar(name: string): string {
  const display = (name || "?").trim() || "?";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    display,
  )}&background=9333EA&color=fff&bold=true&size=128`;
}

function attachmentTypeFromMediaType(mt: string | null): import("@/lib/mock-data").MessageAttachment["type"] {
  switch (mt) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "story_mention":
      return "story_mention";
    case "share":
    case "ig_reel":
      return "share";
    default:
      return "file";
  }
}

export function adaptMessage(row: MessageRow): UiMessage {
  // Inbound WhatsApp/Telegram media is stored as a provider ref (media_id /
  // file_id), not a loadable URL. Route those through the authenticated inbound
  // proxy, which resolves + streams the bytes via the channel token. Things that
  // are already an http(s) URL (IG/Messenger CDN) or our own storage proxy path
  // (outbound send-media) are served as-is.
  const displayUrl = row.media_url
    ? /^https?:\/\//.test(row.media_url) || row.media_url.startsWith("/api/media")
      ? row.media_url
      : `/api/media/inbound/${row.id}`
    : null;

  const attachments = row.media_url
    ? [
        {
          type: attachmentTypeFromMediaType(row.media_type),
          url: displayUrl!,
          // Prefer the stored original filename (outbound media) over the
          // UUID/last-segment of the URL.
          name:
            row.metadata?.media_filename ??
            row.media_url.split("/").pop() ??
            "attachment",
        },
      ]
    : undefined;

  // Auto-translation (lib/ai/auto-translate) persists to metadata.auto_translation
  // as { source, target, text }, but the bubble's show-original toggle reads
  // metadata.translation as { source_lang, target_lang, translated_text }. Map
  // it here so auto-translated inbound actually renders the translation on load
  // (a manual translate still overrides this in client state via onTranslated).
  const autoT = row.metadata?.auto_translation;
  const derivedTranslation =
    autoT && autoT.text
      ? {
          source_lang: autoT.source,
          target_lang: autoT.target,
          translated_text: autoT.text,
        }
      : undefined;
  const uiMetadata = derivedTranslation
    ? { ...row.metadata, translation: derivedTranslation }
    : row.metadata;

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    direction: row.direction,
    body: row.content ?? "",
    attachments,
    replied_to_message_id: row.replied_to_message_id ?? undefined,
    created_at: row.created_at,
    delivery_status: row.direction === "outbound" ? row.status : undefined,
    is_internal_note: row.is_internal_note ?? false,
    ai_activity: (() => {
      const a = deriveAiActivity(row);
      return a.length ? a : undefined;
    })(),
    // A genuine AI bot reply (not an automation send) — the inbox shows a
    // 👍/👎 quality control on these. bot_feedback is layered on in the thread.
    is_bot_reply: row.sender_type === "bot" && !row.metadata?.automation,
    metadata: uiMetadata,
  };
}

export function adaptConversation(
  c: ConversationWithRelations,
  messages: MessageRow[] = [],
): UiConversation {
  const contactName = c.contact.name ?? "Unknown contact";
  return {
    id: c.id,
    channel: c.channel.type,
    status: c.status,
    contact: {
      id: c.contact.id,
      name: contactName,
      avatar: c.contact.avatar_url ?? fallbackAvatar(contactName),
      phone: c.contact.phone ?? undefined,
      email: c.contact.email ?? undefined,
      channel_handles: c.contact.phone
        ? [{ channel: c.channel.type, handle: c.contact.phone }]
        : [],
      tags: (c.contact.tags ?? []).map((t) => ({
        label: t,
        color: "purple" as const,
      })),
      notes: c.contact.notes ?? "",
    },
    last_message_preview: c.last_message_preview ?? "",
    last_message_at: c.last_message_at,
    created_at: c.created_at,
    snooze_until: c.snooze_until,
    channelId: c.channel.id,
    lastInboundAt: c.last_inbound_at,
    unread_count: c.unread_count,
    assigned_agent: c.assigned_agent
      ? {
          id: c.assigned_agent.id,
          name: c.assigned_agent.full_name ?? "Agent",
          avatar:
            c.assigned_agent.avatar_url ??
            fallbackAvatar(c.assigned_agent.full_name ?? "Agent"),
        }
      : undefined,
    messages: messages.map(adaptMessage),
  };
}
