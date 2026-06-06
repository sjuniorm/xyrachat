-- =====================================================================
-- Migration 043 — harden team_messages UPDATE policy (security audit, item 1)
--
-- The migration-029 "sender edits own team chat" UPDATE policy was
--   USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid())
-- which (a) let a sender UPDATE a row they had already soft-deleted —
-- resurrecting it by clearing deleted_at, or editing a deleted message — and
-- (b) omitted an org_id re-check in WITH CHECK, so a hand-crafted PostgREST
-- UPDATE could repoint a sender's OWN row to another org_id.
--
-- Neither is a cross-tenant READ leak (the SELECT policy still scopes reads to
-- org members, and writes are pinned to sender_id = auth.uid()), and there is
-- no edit/delete UI today — but this closes the data-integrity / write-injection
-- gap so the policy is correct if an edit/soft-delete surface is added later.
--
-- The soft-delete path still works: it targets a row WHERE deleted_at IS NULL
-- (passes USING), sets deleted_at, and the unchanged sender_id/org_id pass
-- WITH CHECK. Once deleted, the row can no longer be UPDATEd (USING fails).
-- =====================================================================

DROP POLICY IF EXISTS "sender edits own team chat" ON public.team_messages;
CREATE POLICY "sender edits own team chat" ON public.team_messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (
    sender_id = auth.uid()
    AND org_id IN (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );
