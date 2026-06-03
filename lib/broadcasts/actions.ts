"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAudience } from "./audience";
import { assertCanCreateBroadcast } from "@/lib/billing/gates";
import type { AudienceFilter, VariableMapping } from "./types";

// Re-export type-only so existing imports from the actions module keep
// working without dragging the runtime value across the boundary.
export type { AudienceFilter, VariableMapping } from "./types";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

type AuthSuccess = {
  user: { id: string };
  orgId: string;
  role: "owner" | "admin" | "supervisor" | "agent";
};
type AuthFailure = { error: string };

async function requireOrgRole(
  roles: Array<"owner" | "admin" | "supervisor" | "agent">,
): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return { error: "You must belong to an organization." };
  if (!profile?.role || !roles.includes(profile.role)) {
    return { error: "You don't have permission for that." };
  }
  return { user: { id: user.id }, orgId: profile.org_id, role: profile.role };
}

// =====================================================================
// Audience preview — counts contacts that will receive a broadcast.
// Surfaces both total and opt-out skip, so the UI can show
// "2,450 contacts, 32 opted out — will send to 2,418".
// =====================================================================
export async function previewAudience(
  channelId: string,
  filter: AudienceFilter,
): Promise<
  ActionResult<{
    total: number;
    eligible: number;
    skipped_no_phone: number;
    skipped_opt_out: number;
  }>
> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor", "agent"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: ch } = await admin
    .from("channels")
    .select("id, org_id, type")
    .eq("id", channelId)
    .maybeSingle();
  if (!ch || ch.org_id !== auth.orgId) {
    return { ok: false, error: "Channel not in your org." };
  }
  if (ch.type !== "whatsapp") {
    return { ok: false, error: "Broadcasts are WhatsApp-only for now." };
  }

  const contacts = await fetchAudience(auth.orgId, filter);
  let no_phone = 0;
  let opt_out = 0;
  let eligible = 0;
  for (const c of contacts) {
    if (!c.phone) no_phone += 1;
    else if (c.opted_out) opt_out += 1;
    else eligible += 1;
  }
  return {
    ok: true,
    data: {
      total: contacts.length,
      eligible,
      skipped_no_phone: no_phone,
      skipped_opt_out: opt_out,
    },
  };
}

// =====================================================================
// CREATE — draft a broadcast. We don't send anything yet — that's the
// /api/broadcasts/send route.
// =====================================================================
export async function createBroadcast(payload: {
  name: string;
  channelId: string;
  templateId: string;
  variableMapping: VariableMapping;
  audienceFilter: AudienceFilter;
  scheduleMode: "now" | "later";
  scheduledAt?: string;
}): Promise<ActionResult<{ broadcastId: string }>> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const name = payload.name.trim();
  if (!name) return { ok: false, error: "Broadcast name is required." };

  // Plan gate — broadcasts feature flag + monthly cap. Fails open for
  // un-provisioned orgs.
  const bcGate = await assertCanCreateBroadcast(auth.orgId);
  if (!bcGate.ok) return { ok: false, error: bcGate.error };

  const admin = createAdminClient();
  const [{ data: ch }, { data: tpl }] = await Promise.all([
    admin
      .from("channels")
      .select("id, org_id, type")
      .eq("id", payload.channelId)
      .maybeSingle(),
    admin
      .from("wa_templates")
      .select("id, org_id, meta_status, channel_id")
      .eq("id", payload.templateId)
      .maybeSingle(),
  ]);
  if (!ch || ch.org_id !== auth.orgId) {
    return { ok: false, error: "Channel not in your org." };
  }
  if (!tpl || tpl.org_id !== auth.orgId) {
    return { ok: false, error: "Template not in your org." };
  }
  if (tpl.meta_status !== "APPROVED") {
    return {
      ok: false,
      error: `Template must be approved by Meta first (currently ${tpl.meta_status}).`,
    };
  }
  if (tpl.channel_id !== ch.id) {
    return {
      ok: false,
      error: "Template was created for a different WhatsApp channel.",
    };
  }

  // Schedule sanity-check.
  let scheduledAt: string | null = null;
  let status: "draft" | "scheduled" = "draft";
  if (payload.scheduleMode === "later") {
    if (!payload.scheduledAt) {
      return { ok: false, error: "Pick a date and time." };
    }
    const when = new Date(payload.scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now() + 60_000) {
      return {
        ok: false,
        error: "Scheduled time must be at least a minute in the future.",
      };
    }
    scheduledAt = when.toISOString();
    status = "scheduled";
  }

  // Snapshot the audience size at draft-time so the list view can show
  // "0 / 2,418 sent" right away. Actual eligibility is re-computed at send
  // time in case contacts opt out / new ones appear in the meantime.
  const audience = await fetchAudience(auth.orgId, payload.audienceFilter);

  const { data, error } = await admin
    .from("broadcasts")
    .insert({
      org_id: auth.orgId,
      channel_id: payload.channelId,
      template_id: payload.templateId,
      name,
      variable_mapping: payload.variableMapping,
      audience_filter: payload.audienceFilter,
      status,
      scheduled_at: scheduledAt,
      total_count: audience.filter((c) => c.phone && !c.opted_out).length,
      created_by: auth.user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/broadcasts");
  return { ok: true, data: { broadcastId: data.id } };
}

// =====================================================================
// SOFT-DELETE — only for drafts / cancelled broadcasts
// =====================================================================
export async function deleteBroadcast(id: string): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin"]);
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const { data: bc } = await admin
    .from("broadcasts")
    .select("org_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!bc || bc.org_id !== auth.orgId) {
    return { ok: false, error: "Broadcast not in your org." };
  }
  if (bc.status === "sending") {
    return { ok: false, error: "Can't delete a broadcast mid-send." };
  }
  const { error } = await admin
    .from("broadcasts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/broadcasts");
  return { ok: true };
}

// =====================================================================
// CANCEL — stop a broadcast that hasn't finished.
//   • draft / scheduled  → never sends. The cron's atomic claim only matches
//     draft/scheduled/failed, so flipping to 'cancelled' takes it out of reach.
//   • sending            → signal abort. The send loop re-reads status every
//     50 sends and stops when it sees 'cancelled' (partial counts preserved).
// =====================================================================
export async function cancelBroadcast(id: string): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const { data: bc } = await admin
    .from("broadcasts")
    .select("org_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!bc || bc.org_id !== auth.orgId) {
    return { ok: false, error: "Broadcast not in your org." };
  }
  if (!["draft", "scheduled", "sending"].includes(bc.status)) {
    return { ok: false, error: `Can't cancel a ${bc.status} broadcast.` };
  }
  // Guard the UPDATE on the same status set so a broadcast that finished
  // between our read and write isn't clobbered back to 'cancelled'.
  const { error } = await admin
    .from("broadcasts")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .in("status", ["draft", "scheduled", "sending"]);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/broadcasts");
  return { ok: true };
}

// =====================================================================
// Re-subscribe a contact (manual opt-in). Logs to opt_out_log.
// =====================================================================
export async function reSubscribeContact(
  contactId: string,
): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor", "agent"]);
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, org_id, opted_out")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact || contact.org_id !== auth.orgId) {
    return { ok: false, error: "Contact not in your org." };
  }
  if (!contact.opted_out) return { ok: true };
  await admin
    .from("contacts")
    .update({ opted_out: false, opted_out_at: null, opt_out_reason: null })
    .eq("id", contactId);
  await admin.from("opt_out_log").insert({
    org_id: contact.org_id,
    contact_id: contactId,
    action: "opt_in",
    keyword: null,
    message_content: "Manual re-subscribe by agent",
  });
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}

// fetchAudience() now lives in ./audience.ts as a `server-only` module.
// It MUST NOT be re-exported from this file — anything in a "use server"
// file becomes a client-callable server action, and fetchAudience trusts
// its caller's orgId. Imported above for internal use only.
