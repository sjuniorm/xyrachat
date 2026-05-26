-- Xyra Chat — defensive multi-tenant guard on bot_assignments.
--
-- A bot in org A must never be assigned to a channel in org B. Today this
-- is enforced only by the setChannelAssignment() server action. If anyone
-- inserts a bot_assignments row directly (manual SQL during support,
-- service-role tooling, future bug, etc.) a cross-org assignment would
-- slip through and the webhook would happily run org A's bot against org
-- B's customer messages — leaking org A's knowledge base to the wrong
-- audience.
--
-- This migration adds a BEFORE INSERT OR UPDATE trigger that raises when
-- bot.org_id != channel.org_id. Postgres CHECK constraints can't reference
-- other tables, so a trigger is the right shape.
--
-- We also scrub any *existing* cross-org assignments (there shouldn't be
-- any in production but the trigger would refuse to create one going
-- forward, so we get a clean slate first).

-- 1. Scrub any pre-existing mismatches before installing the trigger.
DELETE FROM bot_assignments a
WHERE EXISTS (
  SELECT 1
  FROM bots b, channels c
  WHERE b.id = a.bot_id
    AND c.id = a.channel_id
    AND b.org_id <> c.org_id
);

-- 2. Trigger function — runs in the row's role, no SECURITY DEFINER
--    needed because we only SELECT from tables the caller already has
--    access to (assignment row was visible enough to trigger this).
CREATE OR REPLACE FUNCTION public.enforce_bot_assignment_org_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_bot_org UUID;
  v_channel_org UUID;
BEGIN
  SELECT org_id INTO v_bot_org FROM bots WHERE id = NEW.bot_id;
  SELECT org_id INTO v_channel_org FROM channels WHERE id = NEW.channel_id;

  IF v_bot_org IS NULL THEN
    RAISE EXCEPTION 'bot_assignments: bot % not found', NEW.bot_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_channel_org IS NULL THEN
    RAISE EXCEPTION 'bot_assignments: channel % not found', NEW.channel_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_bot_org <> v_channel_org THEN
    RAISE EXCEPTION
      'bot_assignments: cross-org assignment refused (bot org % != channel org %)',
      v_bot_org, v_channel_org
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Install on bot_assignments. Drop first so migration is idempotent.
DROP TRIGGER IF EXISTS trg_bot_assignments_org_match ON bot_assignments;
CREATE TRIGGER trg_bot_assignments_org_match
  BEFORE INSERT OR UPDATE OF bot_id, channel_id
  ON bot_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_bot_assignment_org_match();

NOTIFY pgrst, 'reload schema';
