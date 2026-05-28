"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSafeOutboundUrl } from "./ssrf";
import { EVENT_TYPES, type EventType } from "./events";

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
// CREATE webhook endpoint — secret is returned ONCE.
// =====================================================================
export async function createWebhookEndpoint(input: {
  name?: string;
  url: string;
  events: string[];
  filters?: Record<string, unknown>;
}): Promise<
  ActionResult<{
    id: string;
    secret: string;
  }>
> {
  const auth = await requireOrgRole(["owner", "admin"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  if (!input.url?.trim()) return { ok: false, error: "Webhook URL is required." };
  try {
    await assertSafeOutboundUrl(input.url);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid webhook URL.",
    };
  }

  if (!Array.isArray(input.events) || input.events.length === 0) {
    return { ok: false, error: "Pick at least one event to subscribe to." };
  }
  for (const e of input.events) {
    if (!EVENT_TYPES.includes(e as EventType)) {
      return { ok: false, error: `Unknown event: ${e}` };
    }
  }

  const secret = randomBytes(32).toString("hex");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("webhook_endpoints")
    .insert({
      org_id: auth.orgId,
      name: input.name?.trim() || null,
      url: input.url.trim(),
      events: input.events,
      filters: input.filters ?? {},
      secret,
      source: "manual",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/api");
  return { ok: true, data: { id: data.id, secret } };
}

export async function updateWebhookEndpoint(
  id: string,
  patch: { active?: boolean; events?: string[]; filters?: Record<string, unknown>; name?: string | null },
): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin"]);
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("webhook_endpoints")
    .select("org_id")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.org_id !== auth.orgId) {
    return { ok: false, error: "Endpoint not in your org." };
  }
  // Validate events if updating.
  if (patch.events) {
    for (const e of patch.events) {
      if (!EVENT_TYPES.includes(e as EventType)) {
        return { ok: false, error: `Unknown event: ${e}` };
      }
    }
  }
  const allowed = new Set(["active", "events", "filters", "name"]);
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (allowed.has(k)) filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }
  const { error } = await admin
    .from("webhook_endpoints")
    .update(filtered)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/api");
  return { ok: true };
}

export async function deleteWebhookEndpoint(id: string): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin"]);
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("webhook_endpoints")
    .select("org_id")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.org_id !== auth.orgId) {
    return { ok: false, error: "Endpoint not in your org." };
  }
  const { error } = await admin
    .from("webhook_endpoints")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/api");
  return { ok: true };
}

// Manual replay — clone a delivery row, set status='pending', attempt=1.
// The actual re-fire happens on the next retry-worker tick OR via the
// inline deliver path when we wire that up.
export async function replayWebhookDelivery(deliveryId: string): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  // Verify ownership through endpoint.
  const { data: del } = await admin
    .from("webhook_deliveries")
    .select(
      "webhook_endpoint_id, event_type, event_id, payload, webhook_endpoints!inner(org_id)",
    )
    .eq("id", deliveryId)
    .maybeSingle();
  type DeliveryWithOrg = {
    webhook_endpoint_id: string;
    event_type: string;
    event_id: string;
    payload: Record<string, unknown>;
    webhook_endpoints: { org_id: string } | { org_id: string }[];
  };
  if (!del) return { ok: false, error: "Delivery not found." };
  const d = del as unknown as DeliveryWithOrg;
  const endpointOrg = Array.isArray(d.webhook_endpoints)
    ? d.webhook_endpoints[0]?.org_id
    : d.webhook_endpoints?.org_id;
  if (endpointOrg !== auth.orgId) {
    return { ok: false, error: "Delivery not in your org." };
  }
  const { error } = await admin.from("webhook_deliveries").insert({
    webhook_endpoint_id: d.webhook_endpoint_id,
    event_type: d.event_type,
    event_id: d.event_id,
    payload: d.payload,
    attempt: 1,
    status: "pending",
    next_retry_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/api");
  return { ok: true };
}
