-- Xyra Chat — internal notes on conversations.
--
-- Agents type a note in the composer with the "Internal" toggle on; it's
-- stored as a message row but never sent to a provider and never shown to
-- the customer. Visible only to teammates inside the org via RLS on the
-- messages table (already org-scoped via conversation → org_id).
--
-- We model internal notes as messages with `is_internal_note=true` and
-- `direction='outbound'` + `sender_type='agent'`. Keeping them in the
-- same table preserves the chronological scroll, reactions / quote logic
-- and Realtime subscription without a parallel feed.
--
-- Downstream code MUST skip rows where is_internal_note=true when
-- pushing to providers (WA/IG/Telegram/Email). The send endpoints don't
-- read it today because they only ever write outbound rows — the gate
-- lives in the composer (different code path) and the webhook never
-- writes outbound at all. The bot gate (lib/ai/bot-gate.ts) reads
-- recent agent messages to decide auto-pause — that should NOT treat
-- internal notes as agent activity. We add an index to make that filter
-- cheap.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_internal_note BOOLEAN NOT NULL DEFAULT false;

-- Bot gate's auto-pause check: recent agent outbound in this conversation.
-- Internal notes shouldn't suppress the bot (they're not customer-facing).
CREATE INDEX IF NOT EXISTS idx_messages_conv_internal
  ON messages(conversation_id, is_internal_note, created_at DESC)
  WHERE direction = 'outbound';

NOTIFY pgrst, 'reload schema';
