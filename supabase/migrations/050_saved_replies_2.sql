-- =====================================================================
-- 050_saved_replies_2.sql — saved-reply library 2.0.
--
-- Adds categories + usage analytics to the Week-? saved_replies (migration 031).
-- Variable rendering ({{contact_name}} etc.) happens client-side at insert time
-- (no schema change). Existing table → existing RLS/grants apply.
-- =====================================================================

ALTER TABLE public.saved_replies
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;

-- Atomic usage increment (avoids a read-modify-write race when two agents use
-- the same snippet at once). SECURITY DEFINER + org-scoped so it can't bump a
-- snippet outside the caller's org.
CREATE OR REPLACE FUNCTION public.increment_saved_reply_use(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE saved_replies sr
  SET usage_count = sr.usage_count + 1
  WHERE sr.id = p_id
    AND sr.deleted_at IS NULL
    AND sr.org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid() AND deleted_at IS NULL
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_saved_reply_use(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_saved_reply_use(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
