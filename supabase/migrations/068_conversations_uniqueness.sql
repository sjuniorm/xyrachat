-- 068_conversations_uniqueness.sql
--
-- Enforce ONE active conversation per (channel_id, contact_id). A find-or-create
-- race (concurrent inbound webhooks — a comment + a DM, or Meta retries — both
-- SELECT "none" then INSERT) could create duplicate conversations for one
-- contact. Duplicates split the per-conversation idempotency stamps, which can
-- double-send outbound messages.
--
-- Step 1 merges any existing duplicates; step 2 adds a partial unique index so
-- it can't happen again (the loser's INSERT then fails with 23505, which the app
-- catches in lib/inbox/conversation.ts → re-selects the winner).
--
-- Idempotent + safe to re-run. Soft-delete only (never hard-deletes a row).

-- ── Step 1: merge duplicate active conversations ───────────────────────────────
-- For each (channel_id, contact_id) group with >1 active conversation, keep the
-- OLDEST (preserves the original thread), move the losers' messages onto it,
-- refresh the keeper's last_message_at / last_inbound_at, then soft-delete losers.
DO $$
DECLARE
  grp RECORD;
  keeper UUID;
BEGIN
  FOR grp IN
    SELECT channel_id, contact_id
    FROM conversations
    WHERE deleted_at IS NULL
    GROUP BY channel_id, contact_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper
    FROM conversations
    WHERE channel_id = grp.channel_id
      AND contact_id = grp.contact_id
      AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    -- Reassign messages from the losers onto the keeper.
    UPDATE messages
    SET conversation_id = keeper
    WHERE conversation_id IN (
      SELECT id FROM conversations
      WHERE channel_id = grp.channel_id
        AND contact_id = grp.contact_id
        AND deleted_at IS NULL
        AND id <> keeper
    );

    -- Repoint any in-flight automation waits (wait_for_reply) onto the keeper so
    -- a pending reply-resume isn't stranded on a soon-to-be-soft-deleted loser.
    IF to_regclass('public.automation_scheduled_actions') IS NOT NULL THEN
      UPDATE automation_scheduled_actions
      SET conversation_id = keeper
      WHERE conversation_id IN (
        SELECT id FROM conversations
        WHERE channel_id = grp.channel_id
          AND contact_id = grp.contact_id
          AND deleted_at IS NULL
          AND id <> keeper
      );
    END IF;

    -- Refresh the keeper's activity timestamps from its (now merged) messages.
    UPDATE conversations
    SET last_message_at = COALESCE(
          (SELECT MAX(created_at) FROM messages WHERE conversation_id = keeper),
          last_message_at
        ),
        last_inbound_at = COALESCE(
          (SELECT MAX(created_at) FROM messages
             WHERE conversation_id = keeper AND direction = 'inbound'),
          last_inbound_at
        )
    WHERE id = keeper;

    -- Soft-delete the losers.
    UPDATE conversations
    SET deleted_at = now()
    WHERE channel_id = grp.channel_id
      AND contact_id = grp.contact_id
      AND deleted_at IS NULL
      AND id <> keeper;
  END LOOP;
END $$;

-- ── Step 2: enforce uniqueness on active conversations ─────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_channel_contact_active
  ON conversations (channel_id, contact_id)
  WHERE deleted_at IS NULL;
