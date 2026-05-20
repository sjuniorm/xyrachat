import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnthropic, isAnthropicConfigured, MODELS } from "@/lib/ai/clients";
import { detectLanguage } from "@/lib/ai/language-detect";

// POST /api/ai/translate-inbound
// Body: { message_id, target_language? }
// Response:
//   { translation: { source_lang, target_lang, translated_text }, model, cached }
//
// Caches per-target-language under messages.metadata.translation_cache so
// reopening the bubble is instant and doesn't re-spend tokens.
export async function POST(req: Request) {
  let body: { message_id?: string; target_language?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const mid = body.message_id;
  if (!mid) {
    return NextResponse.json({ error: "message_id required" }, { status: 400 });
  }
  const target = (body.target_language ?? "en").toLowerCase();

  // Auth.
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
  if (!profile?.org_id) {
    return NextResponse.json({ error: "No org" }, { status: 403 });
  }

  // Find the message + verify it belongs to a conversation in this org.
  // We do this via supabase (RLS-checked) so a leak isn't possible.
  const { data: msg } = await supabase
    .from("messages")
    .select("id, content, metadata, conversation_id")
    .eq("id", mid)
    .maybeSingle();
  if (!msg || !msg.content) {
    return NextResponse.json({ error: "Message not found or empty" }, { status: 404 });
  }

  // Return cached translation if we already have it for this target.
  const cache = (msg.metadata as { translation_cache?: Record<string, string> } | null)
    ?.translation_cache;
  if (cache?.[target]) {
    const detected = detectLanguage(msg.content);
    return NextResponse.json({
      translation: {
        source_lang: detected.iso ?? "und",
        target_lang: target,
        translated_text: cache[target],
      },
      cached: true,
      model: MODELS.rewrite,
    });
  }

  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const detected = detectLanguage(msg.content);
  // Skip the API hop if the message is already in the target language.
  if (detected.iso === target) {
    return NextResponse.json({
      translation: {
        source_lang: target,
        target_lang: target,
        translated_text: msg.content,
      },
      cached: false,
      same_language: true,
      model: MODELS.rewrite,
    });
  }

  let translated: string;
  try {
    const anthropic = getAnthropic();
    const completion = await anthropic.messages.create({
      model: MODELS.rewrite,
      max_tokens: Math.min(1024, Math.max(256, Math.ceil(msg.content.length))),
      system: `Translate the message to ${target}. Preserve tone, line breaks, and any proper nouns / product names. Return ONLY the translation, no preamble.`,
      messages: [{ role: "user", content: msg.content }],
    });
    translated = completion.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("")
      .trim();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Translate failed" },
      { status: 502 },
    );
  }

  // Write back to the cache under metadata.translation_cache[target].
  // Use admin client so the JSONB merge doesn't fight RLS — we already
  // verified org access above.
  const admin = createAdminClient();
  const newCache = { ...(cache ?? {}), [target]: translated };
  const newMetadata = { ...(msg.metadata ?? {}), translation_cache: newCache };
  await admin
    .from("messages")
    .update({ metadata: newMetadata })
    .eq("id", mid);

  return NextResponse.json({
    translation: {
      source_lang: detected.iso ?? "und",
      target_lang: target,
      translated_text: translated,
    },
    cached: false,
    model: MODELS.rewrite,
  });
}
