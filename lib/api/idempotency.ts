import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Idempotency middleware shared by every mutating POST. Caller supplies
// the Idempotency-Key header value (any string up to 64 chars). We key
// the cache under `${api_key_id}:${header}` so one tenant's keyspace can
// never collide with another's.
//
// Cache TTL is 24 hours (pruned by a cleanup job that lands with the
// debug-phase cron infrastructure — see project_pre_launch_checklist).

const MAX_KEY_LEN = 64;

export type CachedResponse = { status: number; body: unknown };

export async function getCachedIdempotentResponse(
  apiKeyId: string,
  header: string | null,
): Promise<CachedResponse | null> {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LEN) return null;
  const key = `${apiKeyId}:${trimmed}`;
  const admin = createAdminClient();
  const { data } = await admin
    .from("api_idempotency_keys")
    .select("status_code, response_body, created_at")
    .eq("key", key)
    .maybeSingle();
  if (!data) return null;
  // 24h hard expiry — older entries are stale and we re-run the action.
  const ageMs = Date.now() - new Date(data.created_at).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) return null;
  return { status: data.status_code, body: data.response_body };
}

export async function storeIdempotentResponse(
  apiKeyId: string,
  header: string | null,
  response: CachedResponse,
): Promise<void> {
  if (!header) return;
  const trimmed = header.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LEN) return;
  const key = `${apiKeyId}:${trimmed}`;
  const admin = createAdminClient();
  // Use upsert so concurrent writes converge instead of throwing.
  await admin
    .from("api_idempotency_keys")
    .upsert(
      {
        key,
        status_code: response.status,
        response_body: response.body as object,
      },
      { onConflict: "key" },
    );
}
