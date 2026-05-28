// Cursor-based pagination. Cursor = base64(JSON({ id, created_at })) of
// the LAST row in the current page. Stable across inserts (created_at
// rarely changes), unique per row (id), small payload.
//
// Sort order is always (created_at DESC, id DESC) so the cursor's
// `created_at` + `id` form a strict "less than" boundary for the next
// page query.

export type Cursor = { id: string; created_at: string };

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const obj = JSON.parse(json) as Cursor;
    if (typeof obj.id !== "string" || typeof obj.created_at !== "string") {
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

export function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}
