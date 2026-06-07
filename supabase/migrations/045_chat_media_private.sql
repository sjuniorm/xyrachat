-- =====================================================================
-- Migration 045 — make chat-media PRIVATE (security hardening)
--
-- Migration 042 created chat-media as a PUBLIC bucket (stable unauthenticated
-- URLs for inbox rendering). That left outbound business media (invoices, IDs,
-- contracts agents send) readable by anyone a link was forwarded to, forever.
--
-- This flips it private. Objects are now served ONLY through an authenticated
-- proxy (app/api/media/[...path]) that verifies the caller is a signed-in
-- member of the org that owns the conversation in the object path. Uploads
-- still go through the service-role admin client (which bypasses RLS), so no
-- storage.objects policies are required; public read is simply removed.
--
-- Safe to apply: the feature is new + untested (WhatsApp media is dev-mode
-- until Meta App Review), so there are effectively no existing objects whose
-- public URLs would break. New uploads store a /api/media/... proxy path.
-- =====================================================================

UPDATE storage.buckets SET public = false WHERE id = 'chat-media';
