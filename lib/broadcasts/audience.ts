import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AudienceFilter } from "./types";

// Audience resolution for broadcasts. Lives in a server-only module
// (NOT a "use server" actions file) so it can never be invoked as a
// server action by a client. Every caller passes the orgId they already
// authenticated against — this function trusts the caller and is only
// imported from server-side code paths that resolve orgId from the
// session or from a broadcast row's own org_id.
export async function fetchAudience(
  orgId: string,
  filter: AudienceFilter,
): Promise<
  Array<{
    id: string;
    name: string | null;
    phone: string | null;
    opted_out: boolean;
    tags: string[];
  }>
> {
  const admin = createAdminClient();
  let q = admin
    .from("contacts")
    .select("id, name, phone, opted_out, tags")
    .eq("org_id", orgId)
    .is("deleted_at", null);

  if (filter.tags && filter.tags.length > 0) {
    q = q.overlaps("tags", filter.tags);
  }

  const { data: contacts } = await q;
  let rows = (contacts ?? []) as Array<{
    id: string;
    name: string | null;
    phone: string | null;
    opted_out: boolean;
    tags: string[];
  }>;

  if (filter.lastActiveAfter) {
    const { data: active } = await admin
      .from("conversations")
      .select("contact_id")
      .eq("org_id", orgId)
      .gte("last_message_at", filter.lastActiveAfter)
      .is("deleted_at", null);
    const ids = new Set((active ?? []).map((r) => r.contact_id));
    rows = rows.filter((c) => ids.has(c.id));
  }

  return rows;
}
