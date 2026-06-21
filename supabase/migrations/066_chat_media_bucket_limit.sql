-- =====================================================================
-- 066_chat_media_bucket_limit.sql
--
-- The chat-media bucket was created with file_size_limit = 16 MB (migration
-- 042). The Instagram/Messenger/Email/Webchat send-media routes advertise +
-- accept up to 25 MB (video/audio/PDF), so a 16–25 MB upload passed the route
-- checks then failed at storage.upload with a confusing 502. Raise the bucket
-- limit to 25 MB to match the largest route cap. (WhatsApp + Telegram stay
-- capped at 16 MB in their own route configs — Meta/Telegram limits.)
--
-- Idempotent.
-- =====================================================================

UPDATE storage.buckets
SET file_size_limit = 26214400  -- 25 MB
WHERE id = 'chat-media';
