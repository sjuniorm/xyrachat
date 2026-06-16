"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAgentPermissions, agentBlocked } from "@/lib/team/permissions";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Update a contact's editable fields (name / notes / tags). RLS ("org access"
 * on contacts) scopes the update to the caller's org, so a guessed id from
 * another org matches no row. Only the fields provided are touched.
 */
export async function updateContact(input: {
  id: string;
  name?: string;
  notes?: string;
  tags?: string[];
}): Promise<ActionResult> {
  if (!input.id) return { ok: false, error: "Missing contact id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Agent-permission gate: the org can forbid agents from editing contacts.
  const { data: me } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.org_id) {
    const perms = await getAgentPermissions(me.org_id);
    if (agentBlocked(me.role, perms, "can_edit_contacts")) {
      return { ok: false, error: "Your role can't edit contacts." };
    }
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.tags !== undefined) {
    patch.tags = Array.from(
      new Set(input.tags.map((t) => t.trim()).filter(Boolean)),
    ).slice(0, 50);
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase
    .from("contacts")
    .update(patch)
    .eq("id", input.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  revalidatePath("/contacts");
  return { ok: true };
}
