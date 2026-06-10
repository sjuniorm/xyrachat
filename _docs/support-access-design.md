# Design: client-granted support access (for your review)

Security-sensitive (cross-tenant data access), so this is a design to approve
BEFORE I build it — not shipped yet. Decisions you need to make are marked ★.

## Goal
Let Xyra Support enter a client's workspace to actually help (see their inbox,
reproduce an issue, reply) — but only with the client's **explicit, time-boxed,
revocable, audited** consent. Never silent snooping.

## Why not just use the operator console
The operator console (XYRA_OPERATOR_ORG_ID) gives you the *business* view —
stats, billing, trials, entitlements, failed API calls — but **deliberately not
conversation contents** (RLS scopes message bodies to the owning org). That's
the right privacy default. Support access is the consented exception to it.

## Recommended mechanism: temporary scoped membership
Reuse the existing `memberships` + `switch_active_org` machinery rather than a
bespoke "impersonation" path:

1. Client owner/admin flips **"Allow Xyra Support into my workspace"** in
   Settings, picks a duration (★ default 7 days?). This writes a `support_grants`
   row.
2. On your operator **client-detail** page, a granted org shows an **active grant
   badge** + an **"Enter workspace"** button (only while a grant is live).
3. "Enter workspace" inserts a **temporary `memberships` row** for the support
   user in the client org with a special **`support` role** + `expires_at`, then
   switches your active org to it. You now see their data **through normal RLS**
   (no admin-client impersonation hack — you only see what a member could).
4. Auto-expiry: a cron (or a check on each request) removes expired support
   memberships; the client can **revoke instantly** (deletes the grant +
   membership).

### Why this is safe
- No new bypass: access flows through the same RLS every member uses.
- The `support` role is **excluded from seat counts + the client's team list**
  (they never see "Xyra Support" as a teammate unless we choose to show it ★),
  and is **restricted**: read + reply only — **cannot** change billing, delete
  the org, manage team, or rotate channel tokens (gate these on
  `role !== 'support'`).
- Everything is logged.

## Proposed schema (migration 052)
```sql
create table support_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  granted_by uuid references profiles(id) on delete set null,  -- the client admin
  scope text not null default 'read_reply' check (scope in ('read_only','read_reply')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
-- one active grant per org (partial unique where revoked_at is null and not expired)
-- RLS: org members read/manage their own org's grants; service_role full.

create table support_access_log (   -- audit: who entered/acted, when
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  support_user uuid,
  action text not null,            -- 'granted','revoked','entered','exited','action'
  detail jsonb default '{}',
  created_at timestamptz default now()
);
```
Plus: `memberships.role` gains `'support'`; seat-gate + team-list queries exclude it.

## What the client sees (transparency)
- A persistent banner while a grant is active: **"Xyra Support can access this
  workspace until <date> — Revoke"**.
- Optional ★: badge support-sent replies in the thread as "Xyra Support" vs the
  org's own agents.

## Guardrails / open questions for you ★
1. **Default duration** — 7 days? 24h? Let the client pick from presets?
2. **Scope** — read-only by default, or read+reply? (I lean read+reply so support
   can actually resolve, but it's your call.)
3. **Who can grant** — owner only, or owner+admin?
4. **Attribution** — show support replies as "Xyra Support" in the customer's
   chat, or as the org (invisible to the end customer)?
5. **Auto-expiry mechanism** — pg_cron sweep (consistent with our other crons)
   vs. lazy check-on-request. I'd do both (lazy gate + nightly sweep).

## Build plan once approved (~half-day)
migration 052 → `support` role + seat/team exclusions → client Settings card
(grant/revoke + banner) → operator client-detail "Enter workspace" (gated on live
grant) → audit logging → expiry sweep. All behind the consent + RLS model above.

**Tell me your answers to the ★ items and I'll build it in one reviewed pass.**
