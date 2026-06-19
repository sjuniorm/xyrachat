"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vaultReadSecret } from "@/lib/supabase/vault";
import {
  type TemplateCategory,
  type TemplateComponent,
  type TemplateMetaStatus,
  countVariables,
  isValidTemplateName,
} from "./types";

const META_GRAPH_VERSION = "v22.0";

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
// CREATE — save locally + submit to Meta in one step
// =====================================================================
export async function createTemplate(payload: {
  channelId: string;
  name: string;
  language: string;
  category: TemplateCategory;
  components: TemplateComponent[];
  exampleValues?: Record<string, string[]>;
}): Promise<ActionResult<{ templateId: string }>> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const name = payload.name.trim();
  if (!isValidTemplateName(name)) {
    return {
      ok: false,
      error:
        "Template name must be lowercase letters, numbers and underscores only (max 64).",
    };
  }
  const body = payload.components.find((c) => c.type === "BODY");
  if (!body || !("text" in body) || !body.text.trim()) {
    return { ok: false, error: "Template body is required." };
  }
  // If body has {{N}} placeholders, Meta requires an `example.body_text`
  // sample so reviewers can see what real content looks like.
  const varCount = countVariables(body.text);
  if (varCount > 0) {
    const samples = payload.exampleValues?.body ?? [];
    if (samples.length < varCount || samples.some((s) => !s?.trim())) {
      return {
        ok: false,
        error: `Provide example values for all ${varCount} body variable${varCount === 1 ? "" : "s"} so Meta can review.`,
      };
    }
  }

  const admin = createAdminClient();
  const { data: channel } = await admin
    .from("channels")
    .select("id, org_id, type, wa_business_account_id, access_token_vault_id")
    .eq("id", payload.channelId)
    .maybeSingle();
  if (!channel || channel.org_id !== auth.orgId) {
    return { ok: false, error: "Channel not in your org." };
  }
  if (channel.type !== "whatsapp") {
    return { ok: false, error: "Templates are only supported on WhatsApp channels." };
  }
  if (!channel.wa_business_account_id || !channel.access_token_vault_id) {
    return {
      ok: false,
      error:
        "Channel is missing WhatsApp Business Account ID or access token — finish channel setup first.",
    };
  }

  // Pre-empt the unique index so the UI gets a friendly error.
  const { data: dupe } = await admin
    .from("wa_templates")
    .select("id")
    .eq("channel_id", payload.channelId)
    .eq("name", name)
    .eq("language", payload.language)
    .is("deleted_at", null)
    .maybeSingle();
  if (dupe) {
    return {
      ok: false,
      error: `A template named "${name}" in ${payload.language} already exists on this channel.`,
    };
  }

  // Inject example arrays into the components Meta receives. Local table
  // keeps the bare components; the Meta payload gets the examples attached
  // so the review queue passes.
  const metaComponents = injectExamples(
    payload.components,
    payload.exampleValues ?? {},
  );

  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) return { ok: false, error: "Channel token missing from vault." };

  const metaUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${channel.wa_business_account_id}/message_templates`;
  let metaTemplateId: string | null = null;
  let metaStatus: TemplateMetaStatus = "PENDING";
  let metaErrorMessage: string | null = null;
  try {
    const res = await fetch(metaUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        language: payload.language,
        category: payload.category,
        components: metaComponents,
      }),
    });
    const json = (await res.json().catch(() => null)) as
      | { id?: string; status?: TemplateMetaStatus; error?: { message: string } }
      | null;
    if (!res.ok || json?.error) {
      metaErrorMessage =
        json?.error?.message ?? `Meta API error (HTTP ${res.status})`;
    } else {
      metaTemplateId = json?.id ?? null;
      metaStatus = json?.status ?? "PENDING";
    }
  } catch (err) {
    metaErrorMessage = err instanceof Error ? err.message : "Network error";
  }

  // If Meta rejected the submission outright, don't write a local row — the
  // user should fix and resubmit.
  if (metaErrorMessage) {
    return { ok: false, error: metaErrorMessage };
  }

  const { data, error } = await admin
    .from("wa_templates")
    .insert({
      org_id: auth.orgId,
      channel_id: payload.channelId,
      name,
      language: payload.language,
      category: payload.category,
      components: payload.components,
      meta_template_id: metaTemplateId,
      meta_status: metaStatus,
      example_values: payload.exampleValues ?? {},
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/templates");
  return { ok: true, data: { templateId: data.id } };
}

// =====================================================================
// EDIT — resubmit an existing template to Meta. Name + language are immutable
// on Meta's side (create a new template for those); only category + components
// can change. Meta refuses edits while a template is under review, so we gate
// on status. A successful edit flips the template back to PENDING; the
// previously-approved version keeps sending until the edit is approved.
// =====================================================================
export async function editTemplate(payload: {
  templateId: string;
  category: TemplateCategory;
  components: TemplateComponent[];
  exampleValues?: Record<string, string[]>;
}): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const body = payload.components.find((c) => c.type === "BODY");
  if (!body || !("text" in body) || !body.text.trim()) {
    return { ok: false, error: "Template body is required." };
  }
  const varCount = countVariables(body.text);
  if (varCount > 0) {
    const samples = payload.exampleValues?.body ?? [];
    if (samples.length < varCount || samples.some((s) => !s?.trim())) {
      return {
        ok: false,
        error: `Provide example values for all ${varCount} body variable${varCount === 1 ? "" : "s"} so Meta can review.`,
      };
    }
  }

  const admin = createAdminClient();
  const { data: tpl } = await admin
    .from("wa_templates")
    .select("id, org_id, channel_id, meta_template_id, meta_status")
    .eq("id", payload.templateId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!tpl || tpl.org_id !== auth.orgId) {
    return { ok: false, error: "Template not in your org." };
  }
  if (!tpl.meta_template_id) {
    return {
      ok: false,
      error: "Meta never accepted this template — recreate it instead of editing.",
    };
  }
  if (tpl.meta_status === "PENDING" || tpl.meta_status === "IN_APPEAL") {
    return {
      ok: false,
      error:
        "Meta won't accept edits while a template is under review. Wait for approval or rejection first.",
    };
  }

  const { data: channel } = await admin
    .from("channels")
    .select("id, access_token_vault_id")
    .eq("id", tpl.channel_id)
    .maybeSingle();
  if (!channel?.access_token_vault_id) {
    return {
      ok: false,
      error: "Channel is missing its access token — finish channel setup first.",
    };
  }
  const token = await vaultReadSecret(channel.access_token_vault_id);
  if (!token) return { ok: false, error: "Channel token missing from vault." };

  const metaComponents = injectExamples(
    payload.components,
    payload.exampleValues ?? {},
  );

  // Meta edit endpoint is POST to the template ID itself (not the WABA).
  const metaUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${tpl.meta_template_id}`;
  let metaErrorMessage: string | null = null;
  try {
    const res = await fetch(metaUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category: payload.category,
        components: metaComponents,
      }),
    });
    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; error?: { message: string } }
      | null;
    if (!res.ok || json?.error) {
      metaErrorMessage =
        json?.error?.message ?? `Meta API error (HTTP ${res.status})`;
    }
  } catch (err) {
    metaErrorMessage = err instanceof Error ? err.message : "Network error";
  }
  if (metaErrorMessage) return { ok: false, error: metaErrorMessage };

  const { error } = await admin
    .from("wa_templates")
    .update({
      category: payload.category,
      components: payload.components,
      example_values: payload.exampleValues ?? {},
      meta_status: "PENDING",
      meta_rejection_reason: null,
    })
    .eq("id", tpl.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/templates");
  return { ok: true };
}

// =====================================================================
// SYNC — pull current status from Meta for one or all templates in an org
// =====================================================================
export async function syncTemplates(): Promise<
  ActionResult<{ updated: number }>
> {
  const auth = await requireOrgRole(["owner", "admin", "supervisor", "agent"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  // For each WA channel in the org, fetch all templates from Meta and
  // upsert local status.
  const { data: channels } = await admin
    .from("channels")
    .select("id, wa_business_account_id, access_token_vault_id")
    .eq("org_id", auth.orgId)
    .eq("type", "whatsapp")
    .is("deleted_at", null);

  let updated = 0;
  for (const ch of channels ?? []) {
    if (!ch.wa_business_account_id || !ch.access_token_vault_id) continue;
    const token = await vaultReadSecret(ch.access_token_vault_id);
    if (!token) continue;

    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${ch.wa_business_account_id}/message_templates?limit=200`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json().catch(() => null)) as
      | {
          data?: Array<{
            id: string;
            name: string;
            language: string;
            status: TemplateMetaStatus;
            category?: TemplateCategory;
            rejected_reason?: string;
          }>;
        }
      | null;
    if (!res.ok || !json?.data) continue;

    for (const t of json.data) {
      const { error } = await admin
        .from("wa_templates")
        .update({
          meta_status: t.status,
          meta_template_id: t.id,
          meta_rejection_reason: t.rejected_reason ?? null,
        })
        .eq("channel_id", ch.id)
        .eq("name", t.name)
        .eq("language", t.language)
        .is("deleted_at", null);
      if (!error) updated += 1;
    }
  }

  revalidatePath("/templates");
  return { ok: true, data: { updated } };
}

// =====================================================================
// DELETE — soft-delete locally; we don't delete on Meta's side because
// they keep template history for reporting even if the template is unused.
// =====================================================================
export async function deleteTemplate(
  templateId: string,
): Promise<ActionResult> {
  const auth = await requireOrgRole(["owner", "admin"]);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: tpl } = await admin
    .from("wa_templates")
    .select("org_id")
    .eq("id", templateId)
    .maybeSingle();
  if (!tpl || tpl.org_id !== auth.orgId) {
    return { ok: false, error: "Template not in your org." };
  }
  const { error } = await admin
    .from("wa_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/templates");
  redirect("/templates");
}

// =====================================================================
// Helpers
// =====================================================================
// Adds .example arrays to header/body components when sample values are
// available, so Meta's reviewer sees a rendered preview. Returns a NEW
// array; never mutates input.
function injectExamples(
  components: TemplateComponent[],
  examples: Record<string, string[]>,
): TemplateComponent[] {
  return components.map((c) => {
    if (c.type === "BODY") {
      const samples = examples.body ?? [];
      if (samples.length === 0) return c;
      return {
        ...c,
        example: { body_text: [samples] },
      };
    }
    if (c.type === "HEADER" && c.format === "TEXT") {
      const samples = examples.header ?? [];
      if (samples.length === 0) return c;
      return {
        ...c,
        example: { header_text: samples },
      };
    }
    // Media header (IMAGE/VIDEO/DOCUMENT) → Meta requires example.header_handle
    // (a sample uploaded via the Resumable Upload API) or it rejects the template.
    if (c.type === "HEADER" && (c.format === "IMAGE" || c.format === "VIDEO" || c.format === "DOCUMENT")) {
      const handle = examples.header_handle ?? [];
      if (handle.length === 0) return c;
      return {
        ...c,
        example: { header_handle: handle },
      };
    }
    return c;
  });
}
