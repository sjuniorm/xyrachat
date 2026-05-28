// Scope vocabulary for API keys. Keep names stable — changing one forces
// every customer to re-issue their keys. New scopes go at the bottom.
//
// `admin` is a meta-scope that grants everything. Used sparingly (e.g.
// the keys customers use from their internal backend); we'll discourage
// it in the UI in favor of least-privilege per scope.
export const SCOPES = [
  "contacts:read",
  "contacts:write",
  "conversations:read",
  "conversations:write",
  "messages:read",
  "messages:write",
  "channels:read",
  "bots:read",
  "bots:write",
  "templates:read",
  "broadcasts:read",
  "broadcasts:write",
  "automations:read",
  "automations:write",
  "webhooks:read",
  "webhooks:write",
  "outcomes:read",
  "admin",
] as const;

export type Scope = (typeof SCOPES)[number];

export function hasScope(granted: string[], required: Scope): boolean {
  if (granted.includes("admin")) return true;
  return granted.includes(required);
}

export function hasAnyScope(granted: string[], required: Scope[]): boolean {
  if (granted.includes("admin")) return true;
  return required.some((s) => granted.includes(s));
}
