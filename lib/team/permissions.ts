import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Owner-set constraints on the `agent` role (organizations.agent_permissions).
// Defaults preserve today's behaviour; only `agent` is ever constrained.
export type AgentPermissions = {
  restrict_to_assigned: boolean;
  can_delete_conversations: boolean;
  can_export: boolean;
  can_edit_contacts: boolean;
};

export const AGENT_PERMISSION_DEFAULTS: AgentPermissions = {
  restrict_to_assigned: false,
  can_delete_conversations: true,
  can_export: true,
  can_edit_contacts: true,
};

function normalize(raw: unknown): AgentPermissions {
  const r = (raw ?? {}) as Partial<Record<keyof AgentPermissions, unknown>>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    restrict_to_assigned: bool(r.restrict_to_assigned, AGENT_PERMISSION_DEFAULTS.restrict_to_assigned),
    can_delete_conversations: bool(r.can_delete_conversations, AGENT_PERMISSION_DEFAULTS.can_delete_conversations),
    can_export: bool(r.can_export, AGENT_PERMISSION_DEFAULTS.can_export),
    can_edit_contacts: bool(r.can_edit_contacts, AGENT_PERMISSION_DEFAULTS.can_edit_contacts),
  };
}

export async function getAgentPermissions(orgId: string): Promise<AgentPermissions> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("agent_permissions")
    .eq("id", orgId)
    .maybeSingle();
  return normalize(data?.agent_permissions);
}

// True when `role` is constrained by a given capability being OFF. Only the
// `agent` role is ever constrained; everyone senior passes.
export function agentBlocked(
  role: string | null | undefined,
  perms: AgentPermissions,
  cap: "can_delete_conversations" | "can_export" | "can_edit_contacts",
): boolean {
  return role === "agent" && perms[cap] === false;
}
