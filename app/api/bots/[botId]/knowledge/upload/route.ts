import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkText, embedChunks } from "@/lib/ai/embeddings";
import { assertCanAddKnowledgeSource } from "@/lib/billing/gates";
import {
  extractDocumentText,
  isAcceptedDocument,
} from "@/lib/ai/document-extract";

export const runtime = "nodejs";

// Capped under Vercel's serverless request-body limit (~4.5 MB). Larger docs
// should be split or pasted as text; a direct-to-Storage upload path is a
// possible follow-up if customers need bigger files.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  const { botId } = await params;

  // Auth via the cookie session (this is a dashboard upload). Mirror the
  // requireOrgRole check used by the bot server actions.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = profile?.org_id;
  if (!orgId) return NextResponse.json({ error: "No organization." }, { status: 403 });
  if (!profile?.role || !["owner", "admin", "supervisor"].includes(profile.role)) {
    return NextResponse.json({ error: "You don't have permission for that." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: bot } = await admin
    .from("bots")
    .select("org_id")
    .eq("id", botId)
    .maybeSingle();
  if (!bot || bot.org_id !== orgId) {
    return NextResponse.json({ error: "Bot not in your org." }, { status: 404 });
  }

  const gate = await assertCanAddKnowledgeSource(orgId, botId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 402 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "File is empty." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 4 MB). Split it or paste the text instead." },
      { status: 413 },
    );
  }
  if (!isAcceptedDocument(file.name, file.type)) {
    return NextResponse.json(
      { error: "Unsupported type. Upload a PDF, DOCX, TXT, or MD file." },
      { status: 415 },
    );
  }

  let text: string;
  try {
    text = await extractDocumentText(await file.arrayBuffer(), file.type, file.name);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read that file." },
      { status: 422 },
    );
  }
  if (text.trim().length < 20) {
    return NextResponse.json(
      { error: "No readable text found (a scanned/image-only PDF can't be indexed)." },
      { status: 422 },
    );
  }

  const { data: source, error } = await admin
    .from("bot_sources")
    .insert({
      bot_id: botId,
      type: "document",
      title: file.name,
      content: text,
      embedding_status: "pending",
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await embedChunks(chunkText(text), source.id);
  } catch (err) {
    // embedChunks marks the source failed on its own; surface the message.
    return NextResponse.json(
      {
        ok: false,
        sourceId: source.id,
        error: err instanceof Error ? err.message : "Embedding failed.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, sourceId: source.id });
}
