-- =====================================================================
-- 033_restore_org.sql — Support-undo: inverse of soft_delete_org (027).
--
-- Lets an operator reactivate a soft-deleted workspace from the admin
-- console instead of hand-writing SQL during a client incident.
--
-- soft_delete_org stamps every cascade-touched row with the SAME timestamp
-- (Postgres now() is constant within a transaction), so we can restore
-- exactly what the cascade nuked by clearing deleted_at on rows whose
-- deleted_at is AT OR AFTER the org's own deletion stamp. Rows a user
-- deleted individually BEFORE the org purge carry an earlier stamp and
-- stay deleted — restoring the org doesn't resurrect them.
--
-- Idempotent: if the org isn't deleted, it's a no-op.
--
-- NOTE: billing is intentionally NOT restored. If the org was purged after
-- a cancellation, re-provision it via /settings/admin/entitlements.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.restore_org(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_at TIMESTAMPTZ;
BEGIN
  SELECT deleted_at INTO v_deleted_at FROM organizations WHERE id = p_org_id;
  IF v_deleted_at IS NULL THEN
    RETURN; -- not deleted; nothing to do
  END IF;

  -- Org first so org-scoped views see it live again.
  UPDATE organizations SET deleted_at = NULL WHERE id = p_org_id;

  UPDATE profiles          SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE conversations     SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE contacts          SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE channels          SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE bots              SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE wa_templates      SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE broadcasts        SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE automations       SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE api_keys          SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE webhook_endpoints SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;

  -- Messages cascade via their conversation (no org_id column).
  UPDATE messages SET deleted_at = NULL
    WHERE deleted_at >= v_deleted_at
      AND conversation_id IN (SELECT id FROM conversations WHERE org_id = p_org_id);

  -- Bot sources cascade via their bot.
  UPDATE bot_sources SET deleted_at = NULL
    WHERE deleted_at >= v_deleted_at
      AND bot_id IN (SELECT id FROM bots WHERE org_id = p_org_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_org(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_org(UUID) TO service_role;
