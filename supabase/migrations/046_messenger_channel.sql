-- =====================================================================
-- Migration 046 — Facebook Messenger channel
--
-- Messenger piggy-backs on the Messenger Platform (same shape as Instagram
-- DMs): a Facebook Page receives messages via webhook (object "page",
-- entry[].messaging[]); we send via POST /{page_id}/messages with the Page
-- access token. Channel type is 'facebook' (already in the channels.type
-- CHECK from migration 003) and reuses channels.page_id + access_token_vault_id.
--
-- Contacts are identified by their page-scoped id (PSID) → contacts.messenger_id.
-- Inbound idempotency is on messages.messenger_message_id (Messenger mid).
-- =====================================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS messenger_id TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_org_messenger
  ON public.contacts (org_id, messenger_id)
  WHERE messenger_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS messenger_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_fb_unique
  ON public.messages (messenger_message_id)
  WHERE messenger_message_id IS NOT NULL;

-- Idempotent inbound insert (mirrors insert_inbound_ig_message, migration 014).
CREATE OR REPLACE FUNCTION public.insert_inbound_messenger_message(
  p_conversation_id UUID,
  p_content TEXT,
  p_media_url TEXT,
  p_media_type TEXT,
  p_messenger_message_id TEXT,
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
    sender_type, status, messenger_message_id, replied_to_message_id,
    metadata, created_at
  ) VALUES (
    p_conversation_id, 'inbound', p_content, p_media_url, p_media_type,
    'contact', 'sent', p_messenger_message_id, p_replied_to_message_id,
    COALESCE(p_metadata, '{}'::jsonb), p_created_at
  )
  ON CONFLICT (messenger_message_id)
    WHERE messenger_message_id IS NOT NULL
    DO NOTHING
  RETURNING id INTO result_id;
  RETURN result_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_inbound_messenger_message(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ
) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_inbound_messenger_message(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ
) TO service_role;

NOTIFY pgrst, 'reload schema';
