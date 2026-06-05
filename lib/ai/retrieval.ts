import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAI, MODELS } from "@/lib/ai/clients";

export type RetrievalResult = {
  chunks: Array<{ text: string; similarity: number; sourceTitle: string | null }>;
  maxSimilarity: number;
  // OpenAI embedding tokens spent on the query — folded into the org AI budget
  // by the caller so embedding cost is charged honestly.
  embeddingTokens: number;
};

// Embed the query and run match_embeddings (server-side cosine search).
// Returns both the chunks AND the max similarity so the caller can apply
// bot.knowledge_threshold and decide whether to answer or hand off.
export async function retrieveContext(
  query: string,
  botId: string,
  limit = 5,
): Promise<RetrievalResult> {
  // OpenAI rejects an empty embedding input with a 400 — bail cleanly so an
  // image-only / empty-text turn doesn't throw.
  if (!query.trim()) return { chunks: [], maxSimilarity: 0, embeddingTokens: 0 };
  const openai = getOpenAI();
  const embed = await openai.embeddings.create({
    model: MODELS.embedding,
    input: query,
  });
  const queryVec = embed.data[0].embedding;
  const embeddingTokens = embed.usage?.total_tokens ?? 0;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("match_embeddings", {
    query_embedding: queryVec as unknown as number[],
    bot_id_param: botId,
    match_count: limit,
  });
  if (error) throw new Error(`match_embeddings RPC failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    chunk_text: string;
    similarity: number;
    source_id: string;
    source_title: string | null;
  }>;
  const chunks = rows.map((r) => ({
    text: r.chunk_text,
    similarity: r.similarity,
    sourceTitle: r.source_title,
  }));
  const maxSimilarity = chunks.reduce(
    (max, c) => (c.similarity > max ? c.similarity : max),
    0,
  );
  return { chunks, maxSimilarity, embeddingTokens };
}
