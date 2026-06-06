-- =====================================================================
-- Migration 042 — Storage bucket for OUTBOUND chat media
--
-- Agents can now send photos / videos / documents on WhatsApp. The file is
-- uploaded here (so the inbox can render it via a stable public URL) AND to
-- Meta's /media endpoint (to actually send it). Stored at
--   chat-media/<conversation_id>/<uuid>.<ext>
--
-- PUBLIC bucket on purpose: this holds OUTBOUND content the agent is sending
-- TO the customer (not the customer's private inbound media), addressed by an
-- unguessable UUID path, and the inbox <img>/<video> needs a stable URL that
-- doesn't expire (signed URLs would break rendering after expiry). Writes go
-- through the service-role admin client only (server-side, in the send-media
-- route) — RLS on storage.objects is bypassed by service_role, and there is no
-- client-side upload path, so no per-object policies are required.
--
-- 16 MB cap covers WhatsApp's image (5MB) / video (16MB) / audio (16MB)
-- limits; the route enforces tighter per-type caps. Mime validation also
-- happens in the route (allowed_mime_types left NULL here for flexibility).
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-media', 'chat-media', true, 16777216)
ON CONFLICT (id) DO NOTHING;
