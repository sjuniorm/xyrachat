-- =====================================================================
-- 048_webchat_channel.sql — website chat widget channel ('webchat').
--
-- A zero-Meta channel: an embeddable <script> on the customer's website opens
-- a chat that lands in the unified inbox. Visitors are anonymous, identified by
-- a random visitor token (localStorage) → contacts.webchat_id. The widget is
-- gated to a channel by a PUBLIC key (channels.webchat_public_key) — safe to
-- ship in page source; it only allows posting inbound messages to that channel
-- (like a contact form) + polling that visitor's own replies.
--
-- Outbound (agent/bot replies) are plain message rows; the widget polls for
-- them — no third-party provider, so no provider message id / idempotency
-- column is needed (inbound comes through our own rate-limited endpoint).
-- =====================================================================

-- 1. Allow the new channel type. The CHECK from migration 003 is the inline
--    default-named constraint channels_type_check.
ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_type_check;
ALTER TABLE public.channels
  ADD CONSTRAINT channels_type_check
  CHECK (type IN ('whatsapp','instagram','telegram','email','facebook','webchat'));

-- 2. Public widget key — identifies the channel to the embed script. Random,
--    non-secret. Unique while live.
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS webchat_public_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_webchat_key
  ON public.channels (webchat_public_key)
  WHERE webchat_public_key IS NOT NULL AND deleted_at IS NULL;

-- 3. Visitor identity for contacts.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS webchat_id TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_org_webchat
  ON public.contacts (org_id, webchat_id)
  WHERE webchat_id IS NOT NULL AND deleted_at IS NULL;

-- No new tables → existing channels/contacts/messages grants apply. The public
-- inbound + poll endpoints use the service-role admin client (server-side),
-- gated by the public key + visitor token in the handler — not by RLS.

NOTIFY pgrst, 'reload schema';
