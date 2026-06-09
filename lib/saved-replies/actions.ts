"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

async function caller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return null;
  return { supabase, userId: user.id, orgId: profile.org_id as string };
}

export async function createSavedReply(formData: FormData): Promise<ActionResult> {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return { ok: false, error: "Title and message are required." };
  if (title.length > 80) return { ok: false, error: "Title is too long (max 80)." };

  const ctx = await caller();
  if (!ctx) return { ok: false, error: "Not signed in." };

  const { error } = await ctx.supabase.from("saved_replies").insert({
    org_id: ctx.orgId,
    title,
    body,
    created_by: ctx.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true };
}

export async function updateSavedReply(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!id) return { ok: false, error: "Missing id." };
  if (!title || !body) return { ok: false, error: "Title and message are required." };
  if (title.length > 80) return { ok: false, error: "Title is too long (max 80)." };

  const ctx = await caller();
  if (!ctx) return { ok: false, error: "Not signed in." };

  // RLS scopes the row to the caller's org; only update non-deleted rows.
  const { error } = await ctx.supabase
    .from("saved_replies")
    .update({ title, body })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true };
}

export async function deleteSavedReply(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing id." };

  const ctx = await caller();
  if (!ctx) return { ok: false, error: "Not signed in." };

  // RLS scopes to the caller's org; soft-delete.
  const { error } = await ctx.supabase
    .from("saved_replies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true };
}
