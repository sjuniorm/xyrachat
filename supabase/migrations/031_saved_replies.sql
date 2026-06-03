-- Migration 031 — saved_replies (canned responses)
--
-- A shared, per-org library of reusable message snippets agents can insert
-- into the composer. Any member of the org can read + manage them.

CREATE TABLE IF NOT EXISTS public.saved_replies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS saved_replies_org_idx
  ON public.saved_replies (org_id) WHERE deleted_at IS NULL;

ALTER TABLE public.saved_replies ENABLE ROW LEVEL SECURITY;

-- Shared team library: any non-deleted member of the org can read + write.
DROP POLICY IF EXISTS "org access" ON public.saved_replies;
CREATE POLICY "org access" ON public.saved_replies
  FOR ALL TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

-- updated_at maintenance (touch_updated_at() created in migration 018).
DROP TRIGGER IF EXISTS saved_replies_touch ON public.saved_replies;
CREATE TRIGGER saved_replies_touch
  BEFORE UPDATE ON public.saved_replies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT ALL ON public.saved_replies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_replies TO authenticated;
