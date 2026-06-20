-- =====================================================================
-- 064_complete_org_soft_delete.sql
--
-- Complete the GDPR erasure cascade. soft_delete_org() (027) only covered 13
-- tables and drifted as new org-scoped tables were added — so a workspace
-- deletion (GDPR erasure + retention purge) left org data behind in:
--   subscriptions, saved_replies, team_messages, sequences, push_tokens,
--   memberships, bot_reply_feedback, conversation_ratings, org_addons,
--   calendar_connections, crm_connections
-- all of which have org_id + deleted_at. This redefines soft_delete_org to
-- cover them, and keeps restore_org (033) symmetric — EXCEPT billing
-- (subscriptions, org_addons), which by design is not restored (re-provision
-- via /settings/admin/entitlements).
--
-- Idempotent (CREATE OR REPLACE). Re-running is a no-op once rows are deleted.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.soft_delete_org(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Messages cascade via their conversation (no org_id column).
  UPDATE messages SET deleted_at = NOW()
    WHERE deleted_at IS NULL AND conversation_id IN (
      SELECT id FROM conversations WHERE org_id = p_org_id
    );
  UPDATE conversations SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE contacts SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE channels SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE bots SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE wa_templates SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE broadcasts SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE automations SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE api_keys SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE webhook_endpoints SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  -- Bot sources cascade via their bot.
  UPDATE bot_sources SET deleted_at = NOW()
    WHERE deleted_at IS NULL AND bot_id IN (SELECT id FROM bots WHERE org_id = p_org_id);

  -- ---- Tables added since 027 (the drift this migration fixes) ----
  UPDATE subscriptions        SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE org_addons           SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE saved_replies        SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE team_messages        SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE sequences            SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE push_tokens          SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE memberships          SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE bot_reply_feedback   SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE conversation_ratings SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE calendar_connections SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  UPDATE crm_connections      SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;

  -- Profiles: clear org link so members lose access (auth hard-delete is the
  -- GDPR endpoint's job on explicit request).
  UPDATE profiles SET deleted_at = NOW() WHERE org_id = p_org_id AND deleted_at IS NULL;
  -- Finally the org itself.
  UPDATE organizations SET deleted_at = NOW() WHERE id = p_org_id AND deleted_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soft_delete_org(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_org(UUID) TO service_role;

-- restore_org: mirror the new NON-billing tables (billing stays un-restored
-- by design — re-provision via the admin console).
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
    RETURN;
  END IF;

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

  UPDATE messages SET deleted_at = NULL
    WHERE deleted_at >= v_deleted_at
      AND conversation_id IN (SELECT id FROM conversations WHERE org_id = p_org_id);
  UPDATE bot_sources SET deleted_at = NULL
    WHERE deleted_at >= v_deleted_at
      AND bot_id IN (SELECT id FROM bots WHERE org_id = p_org_id);

  -- Non-billing tables added in 064.
  UPDATE saved_replies        SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE team_messages        SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE sequences            SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE push_tokens          SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE memberships          SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE bot_reply_feedback   SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE conversation_ratings SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE calendar_connections SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
  UPDATE crm_connections      SET deleted_at = NULL WHERE org_id = p_org_id AND deleted_at >= v_deleted_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_org(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_org(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
