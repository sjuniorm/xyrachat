-- Xyra Chat — Week 5: Instagram DM support.
--
-- The Instagram Messaging API piggy-backs on the Messenger Platform: a
-- Facebook Page is linked to an Instagram Business Account, and webhook
-- payloads identify the channel by the IG business account's id at
-- entry.id. To send, we POST to the Page's /messages endpoint with the
-- Page access token.
--
-- So a channel of type='instagram' needs:
--   - page_id                     (the linked Facebook Page — used to SEND)
--   - ig_business_account_id      (the IG account — used to LOOK UP from webhooks)
--   - access_token_vault_id       (long-lived Page access token, in Vault)
--
-- We also add a `metadata` JSONB for everything else we want to remember
-- per channel without growing the schema (username, profile pic, OAuth state).

-- =====================================================================
-- CHANNELS — Instagram-specific columns + flexible metadata
-- =====================================================================
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS page_id TEXT,
  ADD COLUMN IF NOT EXISTS ig_business_account_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Look up channel by IG business account id (matches webhook entry.id).
CREATE INDEX IF NOT EXISTS idx_channels_ig_account ON channels(ig_business_account_id)
  WHERE ig_business_account_id IS NOT NULL AND deleted_at IS NULL;

-- Look up channel by Page id (matches Messenger webhook entry.id, also
-- useful when sending via /{page_id}/messages).
CREATE INDEX IF NOT EXISTS idx_channels_page ON channels(page_id)
  WHERE page_id IS NOT NULL AND deleted_at IS NULL;

-- =====================================================================
-- CONTACTS — index on instagram_id for fast find-or-create
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_contacts_org_instagram ON contacts(org_id, instagram_id)
  WHERE instagram_id IS NOT NULL AND deleted_at IS NULL;

-- =====================================================================
-- IDEMPOTENT INBOUND INSERT for Instagram
-- Mirrors insert_inbound_wa_message from migration 006. PostgREST can't
-- target the partial unique index idx_messages_ig_unique from the JS
-- client, so this wrapper does the real ON CONFLICT in SQL and returns
-- the new id (or NULL when the message was already stored).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.insert_inbound_ig_message(
  p_conversation_id UUID,
  p_content TEXT,
  p_media_url TEXT,
  p_media_type TEXT,
  p_ig_message_id TEXT,
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
    conversation_id,
    direction,
    content,
    media_url,
    media_type,
    sender_type,
    status,
    ig_message_id,
    replied_to_message_id,
    metadata,
    created_at
  ) VALUES (
    p_conversation_id,
    'inbound',
    p_content,
    p_media_url,
    p_media_type,
    'contact',
    'sent',
    p_ig_message_id,
    p_replied_to_message_id,
    COALESCE(p_metadata, '{}'::jsonb),
    p_created_at
  )
  ON CONFLICT (ig_message_id)
    WHERE ig_message_id IS NOT NULL
    DO NOTHING
  RETURNING id INTO result_id;

  RETURN result_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_inbound_ig_message(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ
) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.insert_inbound_ig_message(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ
) TO service_role;

NOTIFY pgrst, 'reload schema';
