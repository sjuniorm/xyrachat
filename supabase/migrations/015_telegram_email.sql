-- Xyra Chat — Week 6: Telegram + Email support.
--
-- Telegram identifies channels via a per-channel secret_token we set when
-- calling setWebhook. Telegram echoes it back in the X-Telegram-Bot-Api-
-- Secret-Token header on every webhook call — we look up the channel by
-- that secret. The raw bot token lives in Vault.
--
-- Email uses Resend Inbound: emails to <org-slug>@<INBOUND_EMAIL_DOMAIN>
-- get POSTed to /api/webhooks/email. Each org gets exactly one Email
-- channel keyed by `inbox_email`. The Message-Id header is the idempotency
-- key for inbound rows.

-- =====================================================================
-- CHANNELS — channel-type-specific columns
-- =====================================================================
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS bot_username TEXT,
  ADD COLUMN IF NOT EXISTS inbox_email TEXT;

-- Telegram: look up channel by webhook secret_token (already stored in the
-- existing webhook_secret column from migration 003).
CREATE INDEX IF NOT EXISTS idx_channels_webhook_secret
  ON channels(webhook_secret)
  WHERE webhook_secret IS NOT NULL AND deleted_at IS NULL;

-- Email: look up channel by the inbound address Resend just forwarded to.
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_inbox_email
  ON channels(inbox_email)
  WHERE inbox_email IS NOT NULL AND deleted_at IS NULL;

-- =====================================================================
-- CONTACTS — fast lookup indexes
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_contacts_org_telegram
  ON contacts(org_id, telegram_id)
  WHERE telegram_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_org_email
  ON contacts(org_id, email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- =====================================================================
-- MESSAGES — per-provider idempotency keys
-- =====================================================================
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS telegram_message_id TEXT,
  ADD COLUMN IF NOT EXISTS email_message_id TEXT;

-- telegram_message_id format: "<chat_id>:<message_id>" — Telegram's
-- message_id is only unique within a chat, so we compose.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_telegram_unique
  ON messages(telegram_message_id)
  WHERE telegram_message_id IS NOT NULL;

-- email_message_id: the value of the RFC 5322 Message-Id header.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_email_unique
  ON messages(email_message_id)
  WHERE email_message_id IS NOT NULL;

-- =====================================================================
-- IDEMPOTENT INBOUND INSERT — Telegram
-- =====================================================================
CREATE OR REPLACE FUNCTION public.insert_inbound_telegram_message(
  p_conversation_id UUID,
  p_content TEXT,
  p_media_url TEXT,
  p_media_type TEXT,
  p_telegram_message_id TEXT,
  p_replied_to_message_id UUID,
  p_metadata JSONB,
  p_created_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_id UUID;
BEGIN
  INSERT INTO messages (
    conversation_id, direction, content, media_url, media_type,
    sender_type, status, telegram_message_id,
    replied_to_message_id, metadata, created_at
  ) VALUES (
    p_conversation_id, 'inbound', p_content, p_media_url, p_media_type,
    'contact', 'sent', p_telegram_message_id,
    p_replied_to_message_id, COALESCE(p_metadata, '{}'::jsonb), p_created_at
  )
  ON CONFLICT (telegram_message_id)
    WHERE telegram_message_id IS NOT NULL
    DO NOTHING
  RETURNING id INTO result_id;
  RETURN result_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_inbound_telegram_message(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ
) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_inbound_telegram_message(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ
) TO service_role;

-- =====================================================================
-- IDEMPOTENT INBOUND INSERT — Email
-- =====================================================================
CREATE OR REPLACE FUNCTION public.insert_inbound_email_message(
  p_conversation_id UUID,
  p_content TEXT,
  p_email_message_id TEXT,
  p_replied_to_message_id UUID,
  p_metadata JSONB,
  p_created_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_id UUID;
BEGIN
  INSERT INTO messages (
    conversation_id, direction, content,
    sender_type, status, email_message_id,
    replied_to_message_id, metadata, created_at
  ) VALUES (
    p_conversation_id, 'inbound', p_content,
    'contact', 'sent', p_email_message_id,
    p_replied_to_message_id, COALESCE(p_metadata, '{}'::jsonb), p_created_at
  )
  ON CONFLICT (email_message_id)
    WHERE email_message_id IS NOT NULL
    DO NOTHING
  RETURNING id INTO result_id;
  RETURN result_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_inbound_email_message(
  UUID, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ
) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_inbound_email_message(
  UUID, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ
) TO service_role;

NOTIFY pgrst, 'reload schema';
