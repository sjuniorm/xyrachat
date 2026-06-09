import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_ROWS = 10000;
const RANGE_DAYS: Record<string, number> = { "7": 7, "30": 30, "90": 90 };

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Quote if needed; double internal quotes. Strip leading =,+,-,@ to defang
  // CSV-injection formulas in spreadsheet apps.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 403 });

  const url = new URL(req.url);
  const days = RANGE_DAYS[url.searchParams.get("range") ?? "30"] ?? 30;
  const fromIso = new Date(Date.now() - days * 86_400_000).toISOString();

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("conversations")
    .select(
      "id, status, created_at, last_message_at, channel:channels!conversations_channel_id_fkey(type), contact:contacts!conversations_contact_id_fkey(name)",
    )
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .gte("created_at", fromIso)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  const header = ["conversation_id", "channel", "status", "contact", "created_at", "last_message_at"];
  const lines = [header.join(",")];
  for (const r of rows ?? []) {
    const ch = (r.channel as { type?: string } | null)?.type ?? "";
    const contact = (r.contact as { name?: string } | null)?.name ?? "";
    lines.push(
      [
        csvCell(r.id),
        csvCell(ch),
        csvCell(r.status),
        csvCell(contact),
        csvCell(r.created_at),
        csvCell(r.last_message_at),
      ].join(","),
    );
  }
  const csv = lines.join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="xyra-conversations-${days}d.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
