# Design: richer team-role control (agent permissions)

Founder asked: "can the customer have more control over team roles?" This is the
chosen MVP — confirm/redirect if you wanted something different.

## Today
Four fixed roles: **owner / admin / supervisor / agent**, with hard-coded powers
(owner > admin > supervisor > agent). Owners/admins manage team, billing,
channels, bots; agents handle conversations.

## Chosen MVP — owner-set "Agent permissions"
Rather than a full custom-role engine (big; deferred), give the owner/admin a
small set of **toggles that constrain the junior `agent` role**. Defaults
preserve TODAY's behaviour exactly, so nothing changes for existing orgs until an
owner tightens something.

Toggles (stored on `organizations.agent_permissions` JSONB; empty = all defaults):
- **restrict_to_assigned** (default OFF) — agents see only conversations assigned
  to them OR unassigned, not other agents' chats. Enforced in the inbox LIST
  fetch + a guard on the conversation DETAIL fetch.
- **can_delete_conversations** (default ON) — gate `deleteConversationsBulk`.
- **can_export** (default ON) — gate the GDPR/CSV export path.
- **can_edit_contacts** (default ON) — gate `updateContact`.

Only the `agent` role is constrained; owner/admin/supervisor are unaffected.

## Why app-level enforcement (not RLS)
This is an org restricting its OWN members — not a cross-tenant boundary (RLS
still hard-stops cross-org). So enforcing in the server fetchers/actions is the
right layer; it keeps the (already-audited) RLS policies untouched. The
"restrict_to_assigned" guard is a visibility preference, not a security control.

## UI
An "Agent permissions" card on `/settings/team` (owner/admin only) with the
toggles. Reads/writes `organizations.agent_permissions` via a server action.

## Deferred (future, if customers ask)
- Fully **custom roles** the owner defines (name + permission matrix).
- **Per-member** overrides (this member can/can't X).
- Tuning **supervisor** powers.
These need a real permission-matrix model + a wide gate refactor; the toggle set
covers the common "rein in my agents" need now.
