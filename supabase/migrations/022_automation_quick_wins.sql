-- Xyra Chat — Week 10 quick-wins: extend triggers for telegram + email,
-- track round-robin state per automation.

-- Extend the trigger_type whitelist with telegram + email keywords.
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_type_check
  CHECK (trigger_type IN (
    'ig_new_follower',
    'ig_comment_keyword',
    'ig_story_mention',
    'ig_dm_keyword',
    'wa_keyword',
    'tg_keyword',
    'email_keyword',
    'conversation_opened',
    'webhook'
  ));

-- Round-robin smart-assignment: remember the last agent we routed to so
-- the next fire picks the agent AFTER them in the rotation. Per-automation
-- state — different automations have different agent pools.
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS last_assigned_agent_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
