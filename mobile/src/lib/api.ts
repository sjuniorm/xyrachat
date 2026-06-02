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

export type ApiResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * POST to a web API route authed with the agent's Supabase access token. The
 * web routes accept the JWT via `Authorization: Bearer` (lib/supabase/
 * route-auth.ts). Surfaces the API's `message` (friendly) or `error` (code).
 */
async function authedPost(
  path: string,
  body: unknown,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: string }> {
  if (!API_BASE) return { ok: false, error: "EXPO_PUBLIC_API_BASE_URL not set" };
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
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!res.ok) {
      const msg =
        (json?.message as string) ??
        (json?.error as string) ??
        `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, json: json ?? {} };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Send an outbound message through the web app's channel endpoint. The new
 * message renders via the Realtime subscription (no optimistic insert).
 */
export async function sendMessage(params: {
  channelType: ChannelType;
  conversationId: string;
  content: string;
  repliedToMessageId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const path = SEND_PATH[params.channelType];
  if (!path) {
    return {
      ok: false,
      error: `Sending isn't supported for ${params.channelType} yet`,
    };
  }
  const res = await authedPost(path, {
    conversationId: params.conversationId,
    content: params.content,
    repliedToMessageId: params.repliedToMessageId,
  });
  return res.ok ? { ok: true } : res;
}

/** Send an approved WhatsApp template (re-engage outside the 24h window). */
export async function sendTemplate(params: {
  conversationId: string;
  templateName: string;
  templateLanguage: string;
  components: Array<Record<string, unknown>>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await authedPost("/api/channels/whatsapp/send", {
    conversationId: params.conversationId,
    type: "template",
    templateName: params.templateName,
    templateLanguage: params.templateLanguage,
    templateComponents: params.components,
  });
  return res.ok ? { ok: true } : res;
}

/** AI rewrite of the composer text (improve / friendlier / shorter / …). */
export async function aiAssist(params: {
  text: string;
  action: string;
  conversationId?: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const res = await authedPost("/api/ai/message-assist", {
    text: params.text,
    action: params.action,
    conversation_id: params.conversationId,
  });
  if (!res.ok) return res;
  return { ok: true, text: (res.json.text as string) ?? "" };
}

/** Generate a from-scratch suggested reply grounded in the channel's bot. */
export async function aiSuggestReply(
  conversationId: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const res = await authedPost("/api/ai/suggest-reply", {
    conversation_id: conversationId,
  });
  if (!res.ok) return res;
  return { ok: true, text: (res.json.text as string) ?? "" };
}
