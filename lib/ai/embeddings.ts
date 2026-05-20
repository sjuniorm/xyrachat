import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAI, MODELS } from "@/lib/ai/clients";

// Roughly 500-token chunks with 50-token overlap. We approximate tokens as
// 4 chars (OpenAI's rough heuristic) so we don't need a tokenizer dep —
// the actual embedding API doesn't care about chunk size beyond its 8191
// token cap, and our ~2000-char target sits well under that.
const CHARS_PER_TOKEN = 4;
const CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 50;
const CHUNK_CHARS = CHUNK_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;

// Split text into overlapping chunks. We split on sentence boundaries where
// possible so semantically related content stays together; chunks span up to
// CHUNK_CHARS with OVERLAP_CHARS of leading context from the previous chunk.
export function chunkText(text: string): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/ /g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= CHUNK_CHARS) return [cleaned];

  // Sentence-ish split: paragraph break, then end-of-sentence punctuation.
  const sentences = cleaned
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 <= CHUNK_CHARS) {
      current = current ? `${current} ${sentence}` : sentence;
      continue;
    }
    if (current) chunks.push(current);
    // Seed the next chunk with the tail of the previous one for overlap.
    const tail = current.slice(-OVERLAP_CHARS);
    current = tail ? `${tail} ${sentence}` : sentence;
    // A single sentence longer than CHUNK_CHARS — hard-split on length.
    while (current.length > CHUNK_CHARS) {
      chunks.push(current.slice(0, CHUNK_CHARS));
      current = current.slice(CHUNK_CHARS - OVERLAP_CHARS);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// Embed an array of chunks and persist them. Marks the source row's
// embedding_status. Caller passes sourceId so we can attach chunks to it.
export async function embedChunks(
  chunks: string[],
  sourceId: string,
): Promise<{ inserted: number }> {
  if (chunks.length === 0) return { inserted: 0 };
  const admin = createAdminClient();
  const openai = getOpenAI();

  await admin
    .from("bot_sources")
    .update({ embedding_status: "running", embedding_error: null })
    .eq("id", sourceId);

  try {
    // OpenAI lets us embed up to 2048 inputs per request — batch in chunks
    // of 96 to keep payload size reasonable.
    const batchSize = 96;
    let inserted = 0;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const res = await openai.embeddings.create({
        model: MODELS.embedding,
        input: batch,
      });
      const rows = batch.map((chunk, j) => ({
        source_id: sourceId,
        chunk_text: chunk,
        // pgvector accepts JSON-array-as-string for vector(N) inserts via
        // PostgREST. The supabase-js client serializes our number[] as
        // that string under the hood.
        embedding: res.data[j].embedding as unknown as number[],
        metadata: { index: i + j },
      }));
      const { error: insertErr } = await admin.from("bot_embeddings").insert(rows);
      if (insertErr) throw new Error(insertErr.message);
      inserted += rows.length;
    }

    await admin
      .from("bot_sources")
      .update({ embedding_status: "done" })
      .eq("id", sourceId);

    return { inserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin
      .from("bot_sources")
      .update({ embedding_status: "failed", embedding_error: msg })
      .eq("id", sourceId);
    throw err;
  }
}

// Convenience: ingest raw text → chunk → embed → persist. Returns the
// source id so callers can poll its status.
export async function ingestText(
  botId: string,
  title: string,
  text: string,
): Promise<string> {
  const admin = createAdminClient();
  const { data: source, error } = await admin
    .from("bot_sources")
    .insert({
      bot_id: botId,
      type: "text",
      title,
      content: text,
      embedding_status: "pending",
    })
    .select("id")
    .single();
  if (error || !source) throw new Error(error?.message ?? "failed to create source");
  const chunks = chunkText(text);
  await embedChunks(chunks, source.id);
  return source.id;
}
