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

// In-flight TTL for a pending reservation. A reservation that never completes
// (handler crashed between reserve + store) self-heals after this window so a
// legit retry isn't poisoned for the full 24h.
const PENDING_TTL_MS = 60 * 1000;

export type ReserveResult =
  | { outcome: "fresh" } // caller owns the work; must call storeIdempotentResponse when done
  | { outcome: "duplicate"; cached: CachedResponse | null }; // cached null = still in-flight

// Atomically claim an Idempotency-Key BEFORE doing the side effect. Closes the
// TOCTOU where two concurrent requests with the same key both miss the cache
// and both execute (double-send). The PRIMARY KEY on `key` is the lock: the
// first INSERT wins; a conflicting INSERT returns 0 rows.
export async function reserveIdempotency(
  apiKeyId: string,
  header: string | null,
): Promise<ReserveResult> {
  if (!header) return { outcome: "fresh" };
  const trimmed = header.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LEN) return { outcome: "fresh" };
  const key = `${apiKeyId}:${trimmed}`;
  const admin = createAdminClient();

  // Try to claim with a pending placeholder (status_code 0). ON CONFLICT DO
  // NOTHING → empty select means someone already holds the key.
  const { data: inserted } = await admin
    .from("api_idempotency_keys")
    .upsert(
      { key, status_code: 0, response_body: null },
      { onConflict: "key", ignoreDuplicates: true },
    )
    .select("key");
  if (inserted && inserted.length > 0) return { outcome: "fresh" };

  // Someone else holds it — inspect their row.
  const { data } = await admin
    .from("api_idempotency_keys")
    .select("status_code, response_body, created_at")
    .eq("key", key)
    .maybeSingle();
  if (!data) return { outcome: "fresh" }; // vanished between calls — just run
  const ageMs = Date.now() - new Date(data.created_at).getTime();

  if (data.status_code === 0) {
    // Still pending. Within the in-flight window → conflict; past it → the
    // owner died, reclaim by resetting the timestamp.
    if (ageMs <= PENDING_TTL_MS) return { outcome: "duplicate", cached: null };
    await admin
      .from("api_idempotency_keys")
      .update({ created_at: new Date().toISOString() })
      .eq("key", key);
    return { outcome: "fresh" };
  }

  // Completed. Serve the cached response unless it's past the 24h TTL.
  if (ageMs > 24 * 60 * 60 * 1000) {
    await admin
      .from("api_idempotency_keys")
      .update({ status_code: 0, response_body: null, created_at: new Date().toISOString() })
      .eq("key", key);
    return { outcome: "fresh" };
  }
  return { outcome: "duplicate", cached: { status: data.status_code, body: data.response_body } };
}

// Release a reservation (handler failed before producing a cacheable response)
// so the key is immediately retryable instead of waiting out the pending TTL.
export async function releaseIdempotency(apiKeyId: string, header: string | null): Promise<void> {
  if (!header) return;
  const trimmed = header.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LEN) return;
  const admin = createAdminClient();
  await admin
    .from("api_idempotency_keys")
    .delete()
    .eq("key", `${apiKeyId}:${trimmed}`)
    .eq("status_code", 0);
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
