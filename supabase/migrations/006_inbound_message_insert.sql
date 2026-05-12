-- Xyra Chat — true ON CONFLICT idempotent insert for inbound messages.
--
-- Background: PostgREST (the layer supabase-js uses for table operations)
-- can't target a PARTIAL unique index in ON CONFLICT — the WHERE clause
-- on our idx_messages_wa_unique index can't be expressed through the JS
-- client. Wrapping the real Postgres ON CONFLICT in a SECURITY DEFINER
-- function gives us literal SQL semantics + service-role-only execution.
--
-- Returns the inserted message id, OR NULL when the wa_message_id was
-- already present (i.e. Meta retried the delivery). The caller treats
-- NULL as "already processed, skip downstream side effects".

CREATE OR REPLACE FUNCTION public.insert_inbound_wa_message(
  p_conversation_id UUID,
  p_content TEXT,
  p_media_url TEXT,
  p_media_type TEXT,
  p_wa_message_id TEXT,
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
    wa_message_id,
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
    p_wa_message_id,
    p_replied_to_message_id,
    COALESCE(p_metadata, '{}'::jsonb),
    p_created_at
  )
  ON CONFLICT (wa_message_id)
    WHERE wa_message_id IS NOT NULL
    DO NOTHING
  RETURNING id INTO result_id;

  RETURN result_id; -- NULL when the row already existed
END;
$$;

-- Lock down: anon / authenticated must never call this. Service-role only.
REVOKE EXECUTE ON FUNCTION public.insert_inbound_wa_message(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ
) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.insert_inbound_wa_message(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ
) TO service_role;

NOTIFY pgrst, 'reload schema';
