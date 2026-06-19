-- =====================================================================
-- 062_email_signature.sql — editable HTML signature for outbound email replies.
--
-- Org-level HTML appended to every agent email reply (a branded footer/template
-- — answers "can clients edit how the mail gets sent back"). Stored sanitized at
-- write time AND re-sanitized at send time. NULL/empty = no signature (today's
-- plain behaviour). Per-channel signatures are a future refinement.
-- =====================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS email_signature text;

NOTIFY pgrst, 'reload schema';
