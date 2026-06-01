import "server-only";

// Low-level Expo Push API client. https://docs.expo.dev/push-notifications/sending-notifications/
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_PER_REQUEST = 100; // Expo's documented batch cap.

const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;

export function isExpoPushToken(token: string): boolean {
  return EXPO_TOKEN_RE.test(token);
}

export type ExpoPushMessage = {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
};

export type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

/**
 * Sends Expo push messages, chunked to Expo's batch cap, and returns the
 * receipt tickets aligned to the input order. NEVER throws — push delivery is
 * best-effort and must never break the webhook that triggered it. A failed
 * request yields error tickets so the caller can still prune dead tokens.
 */
export async function sendExpoPush(
  messages: ExpoPushMessage[],
): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];
  const tickets: ExpoPushTicket[] = [];

  for (let i = 0; i < messages.length; i += MAX_PER_REQUEST) {
    const chunk = messages.slice(i, i + MAX_PER_REQUEST);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: ExpoPushTicket[] }
        | null;
      if (res.ok && Array.isArray(json?.data)) {
        tickets.push(...json.data);
      } else {
        console.warn("[push] Expo push API error", res.status);
        chunk.forEach(() =>
          tickets.push({ status: "error", message: `HTTP ${res.status}` }),
        );
      }
    } catch (err) {
      console.warn("[push] Expo push request failed", err);
      chunk.forEach(() =>
        tickets.push({ status: "error", message: "request failed" }),
      );
    }
  }

  return tickets;
}
