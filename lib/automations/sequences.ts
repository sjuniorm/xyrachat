"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SequenceStep = { delay_minutes: number; message: string };
export type SequenceRow = {
  id: string;
  name: string;
  steps: SequenceStep[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

const MAX_STEPS = 25;
const MAX_MESSAGE = 2000;

async function caller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id || !profile.role) return null;
  return { supabase, userId: user.id, orgId: profile.org_id as string, role: profile.role as string };
}

// Owners / admins / supervisors can manage sequences (same as automations).
function canManage(role: string) {
  return role === "owner" || role === "admin" || role === "supervisor";
}

function validateSteps(raw: unknown): SequenceStep[] | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "Add at least one step." };
  }
  if (raw.length > MAX_STEPS) return { error: `Too many steps (max ${MAX_STEPS}).` };
  const steps: SequenceStep[] = [];
  for (const s of raw) {
    const obj = s as { delay_minutes?: unknown; message?: unknown };
    const delay = Number(obj.delay_minutes);
    const message = typeof obj.message === "string" ? obj.message.trim() : "";
    if (!Number.isFinite(delay) || delay < 0) return { error: "Each step needs a delay of 0 or more minutes." };
    if (!message) return { error: "Each step needs a message." };
    if (message.length > MAX_MESSAGE) return { error: `A step message is too long (max ${MAX_MESSAGE}).` };
    steps.push({ delay_minutes: Math.floor(delay), message });
  }
  return steps;
}

export async function createSequence(input: {
  name: string;
  steps: SequenceStep[];
}): Promise<ActionResult<{ id: string }>> {
  const ctx = await caller();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.role)) return { ok: false, error: "You don't have permission for that." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  const steps = validateSteps(input.steps);
  if ("error" in steps) return { ok: false, error: steps.error };

  const { data, error } = await ctx.supabase
    .from("sequences")
    .insert({ org_id: ctx.orgId, name, steps, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/automations/sequences");
  return { ok: true, data: { id: data.id } };
}

export async function updateSequence(input: {
  id: string;
  name: string;
  steps: SequenceStep[];
  active?: boolean;
}): Promise<ActionResult> {
  const ctx = await caller();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.role)) return { ok: false, error: "You don't have permission for that." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  const steps = validateSteps(input.steps);
  if ("error" in steps) return { ok: false, error: steps.error };

  // RLS scopes the row to the caller's org; only touch non-deleted rows.
  const patch: Record<string, unknown> = { name, steps };
  if (typeof input.active === "boolean") patch.active = input.active;
  const { error } = await ctx.supabase
    .from("sequences")
    .update(patch)
    .eq("id", input.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/automations/sequences");
  return { ok: true };
}

export async function deleteSequence(id: string): Promise<ActionResult> {
  const ctx = await caller();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!canManage(ctx.role)) return { ok: false, error: "You don't have permission for that." };
  const { error } = await ctx.supabase
    .from("sequences")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/automations/sequences");
  return { ok: true };
}
