import { supabase } from "./supabase";
import type { ChannelType } from "../types";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

// Maps a channel to its web send endpoint. Messenger (facebook) has no send
// path yet on the web app, so it's intentionally absent.
const SEND_PATH: Partial<Record<ChannelType, string>> = {
  whatsapp: "/api/channels/whatsapp/send",
  instagram: "/api/channels/instagram/send",
  telegram: "/api/channels/telegram/send",
  email: "/api/channels/email/send",
};

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Sends an outbound message through the web app's channel endpoint, authed
 * with the agent's Supabase access token (the endpoints accept the JWT via
 * `Authorization: Bearer` — see lib/supabase/route-auth.ts on the web side).
 * The new message arrives back in the UI via the Realtime subscription, so we
 * don't optimistically insert here.
 */
export async function sendMessage(params: {
  channelType: ChannelType;
  conversationId: string;
  content: string;
  repliedToMessageId?: string;
}): Promise<SendResult> {
  if (!API_BASE) return { ok: false, error: "EXPO_PUBLIC_API_BASE_URL not set" };

  const path = SEND_PATH[params.channelType];
  if (!path) {
    return { ok: false, error: `Sending isn't supported for ${params.channelType} yet` };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: "Not signed in" };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversationId: params.conversationId,
        content: params.content,
        repliedToMessageId: params.repliedToMessageId,
      }),
    });
    const json = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!res.ok) {
      return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
