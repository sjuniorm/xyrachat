import type { ChannelType, Contact } from "../types";

const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  telegram: "Telegram",
  email: "Email",
  facebook: "Messenger",
};

export function channelLabel(type?: ChannelType | null): string {
  if (!type) return "Channel";
  return CHANNEL_LABELS[type] ?? type;
}

/** MaterialCommunityIcons name per channel (paper / @expo/vector-icons). */
export const CHANNEL_ICON: Record<ChannelType, string> = {
  whatsapp: "whatsapp",
  instagram: "instagram",
  telegram: "send",
  email: "email-outline",
  facebook: "facebook-messenger",
};

export function contactDisplayName(contact?: Contact | null): string {
  if (!contact) return "Unknown";
  return (
    contact.name ||
    contact.phone ||
    contact.email ||
    contact.instagram_id ||
    contact.telegram_id ||
    "Unknown"
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Compact relative time, e.g. "now", "5m", "3h", "2d", or a date. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Full timestamp for the chat thread, e.g. "14:32". */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function messagePreview(m: {
  content: string | null;
  media_type: string | null;
}): string {
  if (m.content?.trim()) return m.content.trim();
  if (m.media_type) {
    const t = m.media_type.toLowerCase();
    if (t.includes("image")) return "📷 Photo";
    if (t.includes("video")) return "🎬 Video";
    if (t.includes("audio") || t.includes("voice")) return "🎙️ Voice message";
    if (t.includes("document")) return "📄 Document";
    return "📎 Attachment";
  }
  return "";
}
