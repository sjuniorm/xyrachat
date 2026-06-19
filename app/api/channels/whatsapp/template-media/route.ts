import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const GRAPH = "https://graph.facebook.com/v22.0";
const MAX_BYTES = 16 * 1024 * 1024; // Meta caps template header samples well under this
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "video/mp4",
  "application/pdf",
]);

// POST (multipart form-data, field "file") → uploads a WhatsApp TEMPLATE media
// sample via Meta's Resumable Upload API and returns its { handle }. The handle
// goes into the template component's example.header_handle so Meta can review a
// media-header template (IMAGE/VIDEO/DOCUMENT). Owner/admin only. Uses the app
// access token (META_APP_ID|META_APP_SECRET) — env-gated.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me?.org_id) return NextResponse.json({ error: "No org" }, { status: 403 });
  if (me.role !== "owner" && me.role !== "admin") {
    return NextResponse.json({ error: "Owners/admins only" }, { status: 403 });
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "Template media upload isn't configured (META_APP_ID / META_APP_SECRET)." },
      { status: 503 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is empty or too large." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: `Unsupported type ${file.type}. Use JPEG/PNG/MP4/PDF.` }, { status: 400 });
  }

  const appToken = `${appId}|${appSecret}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    // 1. Create an upload session.
    const sessionRes = await fetch(
      `${GRAPH}/${appId}/uploads?file_name=${encodeURIComponent(file.name)}&file_length=${bytes.length}&file_type=${encodeURIComponent(file.type)}`,
      { method: "POST", headers: { Authorization: `OAuth ${appToken}` } },
    );
    const sessionJson = (await sessionRes.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
    if (!sessionRes.ok || !sessionJson?.id) {
      return NextResponse.json({ error: sessionJson?.error?.message ?? `Upload session failed (HTTP ${sessionRes.status})` }, { status: 502 });
    }

    // 2. Upload the bytes (single chunk; file_offset 0).
    const uploadRes = await fetch(`${GRAPH}/${sessionJson.id}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${appToken}`, file_offset: "0", "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    const uploadJson = (await uploadRes.json().catch(() => null)) as { h?: string; error?: { message?: string } } | null;
    if (!uploadRes.ok || !uploadJson?.h) {
      return NextResponse.json({ error: uploadJson?.error?.message ?? `Upload failed (HTTP ${uploadRes.status})` }, { status: 502 });
    }

    return NextResponse.json({ handle: uploadJson.h });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload error" }, { status: 502 });
  }
}
