import "server-only";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiKey } from "./keys";
import { hasScope, type Scope } from "./scopes";
import { forbidden, unauthorized } from "./errors";

export type ApiKeyContext = {
  apiKeyId: string;
  orgId: string;
  scopes: string[];
  name: string;
};

export type AuthSuccess = { ok: true; ctx: ApiKeyContext };
export type AuthFailure = { ok: false; response: ReturnType<typeof unauthorized> };

// Pull the API key off the Authorization header and resolve it to an
// ApiKeyContext. Logs last_used_at + last_used_ip async (doesn't block
// the request response).
export async function requireApiKey(
  req: NextRequest,
  ...required: Scope[]
): Promise<AuthSuccess | AuthFailure> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return { ok: false, response: unauthorized() };
  const plaintext = match[1].trim();
  if (!plaintext.startsWith("xyra_")) {
    return { ok: false, response: unauthorized() };
  }

  let hash: string;
  try {
    hash = hashApiKey(plaintext);
  } catch {
    return {
      ok: false,
      response: unauthorized(
        "server_misconfigured",
        "API authentication is not configured on this server.",
      ),
    };
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("api_keys")
    .select("id, org_id, name, scopes, key_hash, expires_at, revoked_at, deleted_at")
    .eq("key_hash", hash)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { ok: false, response: unauthorized() };

  const a = Buffer.from(row.key_hash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, response: unauthorized() };
  }

  if (row.revoked_at) {
    return {
      ok: false,
      response: unauthorized("key_revoked", "This API key has been revoked."),
    };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return {
      ok: false,
      response: unauthorized("key_expired", "This API key has expired."),
    };
  }

  for (const need of required) {
    if (!hasScope(row.scopes ?? [], need)) {
      return {
        ok: false,
        response: forbidden(
          "insufficient_scope",
          `This API key is missing scope: ${need}`,
        ),
      };
    }
  }

  // Best-effort last_used_at update. Don't await.
  void admin
    .from("api_keys")
    .update({
      last_used_at: new Date().toISOString(),
      last_used_ip: getClientIp(req),
    })
    .eq("id", row.id);

  return {
    ok: true,
    ctx: {
      apiKeyId: row.id,
      orgId: row.org_id,
      scopes: row.scopes ?? [],
      name: row.name,
    },
  };
}

function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? null;
}

// Fire-and-forget request log. Bodies are NEVER logged.
export async function logApiRequest(input: {
  apiKeyId: string | null;
  orgId: string | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip: string | null;
  userAgent: string | null;
  idempotencyKey: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("api_request_log").insert({
      api_key_id: input.apiKeyId,
      org_id: input.orgId,
      method: input.method,
      path: input.path,
      status: input.status,
      duration_ms: input.durationMs,
      ip: input.ip,
      user_agent: input.userAgent,
      idempotency_key: input.idempotencyKey,
    });
  } catch {
    // Logging must never block a response.
  }
}
