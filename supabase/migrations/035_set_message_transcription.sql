-- =====================================================================
-- 035_set_message_transcription.sql — atomic, idempotent voice-note transcript
-- persist.
--
-- Two paths can transcribe the same audio message (the bot gate on inbound +
-- an agent's on-demand "Transcribe" click). This RPC makes the write:
--   • atomic     — a server-side JSONB merge (`||`), so it never clobbers a
--                  concurrent metadata writer (e.g. auto-translate) the way a
--                  read-modify-write from app code would.
--   • idempotent — only writes when no transcription exists yet. It RETURNS the
--                  id only to the winner, so the caller charges the AI budget
--                  exactly once (no double-charge race).
--   • caption-safe — keeps an existing non-empty content (a real caption);
--                    only fills content with the transcript when empty.
-- service_role only (called from the bot gate + the on-demand server action,
-- both under the admin client).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_message_transcription(
  p_message_id UUID,
  p_text TEXT,
  p_model TEXT
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE messages
  SET content = COALESCE(NULLIF(content, ''), p_text),
      metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object(
             'transcription',
             jsonb_build_object('text', p_text, 'model', p_model)
           )
  WHERE id = p_message_id
    AND (metadata -> 'transcription') IS NULL
  RETURNING id;
$$;

REVOKE EXECUTE ON FUNCTION public.set_message_transcription(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_message_transcription(UUID, TEXT, TEXT)
  TO service_role;
