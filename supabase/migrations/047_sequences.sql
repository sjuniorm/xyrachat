-- =====================================================================
-- 047_sequences.sql — reusable drip sequences for automations.
--
-- A sequence is a named, ordered list of timed messages. The automation
-- action `add_to_sequence` enrolls a contact: the executor expands the
-- sequence's steps into a wait→send_dm chain and enqueues ONE row into
-- automation_scheduled_actions (migration 037), so the EXISTING per-minute
-- automation-runner drips it out. No new runner / enrollment table needed —
-- in-flight drips live in automation_scheduled_actions like every other wait.
--
-- steps shape (JSONB array, in order):
--   [{ "delay_minutes": <int ≥0>, "message": "<text, supports {{first_name}} etc>" }]
-- delay_minutes on step 1 is the wait BEFORE the first message (0 ≈ next tick).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sequences (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  steps      jsonb NOT NULL DEFAULT '[]'::jsonb,
  active     boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS sequences_org_idx
  ON public.sequences (org_id) WHERE deleted_at IS NULL;

ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;

-- Org-scoped access (same shape as saved_replies, migration 031): any member of
-- the org can read/write its sequences; role gating (owner/admin/supervisor) is
-- enforced in the server actions. Always AND deleted_at IS NULL.
DROP POLICY IF EXISTS "org access" ON public.sequences;
CREATE POLICY "org access" ON public.sequences
  FOR ALL
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

CREATE OR REPLACE FUNCTION public.touch_sequences_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sequences_touch ON public.sequences;
CREATE TRIGGER trg_sequences_touch
  BEFORE UPDATE ON public.sequences
  FOR EACH ROW EXECUTE FUNCTION public.touch_sequences_updated_at();

-- Data-API grants (Supabase removed auto-grants for new public tables).
GRANT ALL ON public.sequences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequences TO authenticated;

NOTIFY pgrst, 'reload schema';
