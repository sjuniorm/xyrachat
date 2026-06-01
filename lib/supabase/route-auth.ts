import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient as createSsrClient } from "@/lib/supabase/server";

/**
 * Resolve the calling user for a route handler, supporting BOTH first-party
 * surfaces:
 *
 *  - Web app  → Supabase session cookie (via @supabase/ssr).
 *  - Mobile app (Expo / React Native) → `Authorization: Bearer <jwt>` where the
 *    JWT is the user's Supabase access token.
 *
 * In both cases the returned `supabase` client is RLS-scoped to that user, so
 * `.from(...)` reads obey the same org isolation as the web app. The JWT is
 * validated server-side via `auth.getUser(token)` (not just decoded locally),
 * so a forged/expired token resolves to `user = null`.
 *
 * This is for FIRST-PARTY clients (our own web + mobile apps). External
 * integrations use the public REST API under /api/v1 with `xyra_live_` API
 * keys — a different, scope-gated auth path. Don't conflate the two.
 */
export async function getRouteUser(
  req: Request,
): Promise<{ supabase: SupabaseClient; user: User | null }> {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon || !token) {
      // Fall through to cookie auth below if the Bearer path is unusable.
    } else {
      const supabase = createSupabaseJsClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      return { supabase, user };
    }
  }

  const supabase = await createSsrClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
