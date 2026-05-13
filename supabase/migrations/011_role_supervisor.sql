-- Xyra Chat — add 'supervisor' role + allow multiple owners.
--
-- Role hierarchy now:
--   owner       — full control (invite/remove anyone incl. other owners*,
--                  manage channels + settings + billing). Multiple owners
--                  allowed. *Can't remove the last owner — see action layer.
--   admin       — invite/remove agents and supervisors, manage channels.
--                  Can't touch owners or other admins.
--   supervisor  — sees everything in the inbox, can assign/close/snooze any
--                  conversation. Cannot invite/remove members or manage
--                  channels/settings.
--   agent       — replies to conversations. Same conversation access as
--                  supervisor at the DB level (RLS is org-scoped); we
--                  differentiate via UI affordances + action-level checks.
--
-- The CHECK constraint adds 'supervisor' to the allowed values. Profiles
-- with role IN ('owner','admin','agent') keep their value; nothing migrates.

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'supervisor', 'agent'));

NOTIFY pgrst, 'reload schema';
