import "server-only";
import { rateLimit } from "@/lib/rate-limit";

// Per-contact / per-conversation flood guard for INBOUND-triggered AI spend
// (bot replies + auto-translate). Without it, one hostile external user can
// hammer a channel and drain a victim org's monthly AI budget — and run up our
// real Anthropic/OpenAI bill. Each guarded AI op consumes one slot from both a
// per-contact and a per-conversation sliding window; when either is exhausted
// the caller skips the spend.
//
// Limits are generous (a real conversation rarely exceeds them) and FAIL OPEN
// until Upstash is configured (lib/rate-limit) — a safety throttle, not a gate.
const CONTACT_LIMIT = 120; // AI ops / hour per (org, contact)
const CONTACT_WINDOW = 3600;
const CONV_LIMIT = 200; // AI ops / day per (org, conversation)
const CONV_WINDOW = 86_400;

export async function aiInboundAllowed(
  orgId: string,
  contactId: string,
  conversationId?: string,
): Promise<boolean> {
  // Per-contact window is the primary flood defense (one contact spamming) and
  // is SHARED across the bot-reply + auto-translate paths, so it bounds total
  // per-contact AI ops regardless of which fired.
  const byContact = await rateLimit("ai:contact", `${orgId}:${contactId}`, {
    limit: CONTACT_LIMIT,
    windowSec: CONTACT_WINDOW,
  });
  if (!byContact.ok) return false;
  if (!conversationId) return true;
  const byConv = await rateLimit("ai:conv", `${orgId}:${conversationId}`, {
    limit: CONV_LIMIT,
    windowSec: CONV_WINDOW,
  });
  return byConv.ok;
}
