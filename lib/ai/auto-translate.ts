import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectLanguage } from "@/lib/ai/language-detect";
import { getAnthropic, isAnthropicConfigured, MODELS } from "@/lib/ai/clients";

// Called from webhook handlers fire-and-forget after the inbound is stored
// AND BEFORE we ack the provider. Per-channel toggle:
//   channels.auto_translate_inbound  → on/off
//   channels.auto_translate_target_lang → target ISO 639-1 (e.g. 'en'),
//     NULL = treat 'en' as default.
//
// We cache the detected language on contacts.detected_language so we don't
// burn API calls on stable customers. After 3 consecutive matches we lock
// the cache and skip detection until the cache is invalidated by a mismatch.
export async function maybeAutoTranslate(args: {
  channel: { id: string; type: string; auto_translate_inbound?: boolean | null; auto_translate_target_lang?: string | null };
  contactId: string;
  messageId: string;
  content: string;
}): Promise<void> {
  if (!args.channel.auto_translate_inbound) return;
  if (!args.content || args.content.length < 4) return;
  if (!isAnthropicConfigured()) return;

  const target = (args.channel.auto_translate_target_lang ?? "en").toLowerCase();
  const admin = createAdminClient();

  // Pull cached language for the contact.
  const { data: contact } = await admin
    .from("contacts")
    .select("detected_language, detected_language_confidence")
    .eq("id", args.contactId)
    .maybeSingle();

  let sourceIso: string | null = contact?.detected_language ?? null;
  let updatedConfidence = contact?.detected_language_confidence ?? 0;

  // Detect when we don't have a confident cached answer.
  if (!sourceIso || updatedConfidence < 0.9) {
    const detected = detectLanguage(args.content);
    if (detected.iso) {
      if (sourceIso === detected.iso) {
        // Same as last time — bump confidence toward the "lock" threshold.
        updatedConfidence = Math.min(1, updatedConfidence + 0.2);
      } else {
        sourceIso = detected.iso;
        updatedConfidence = detected.confidence;
      }
      await admin
        .from("contacts")
        .update({
          detected_language: sourceIso,
          detected_language_confidence: updatedConfidence,
        })
        .eq("id", args.contactId);
    }
  }

  // No actionable language → skip silently.
  if (!sourceIso || sourceIso === target) return;

  // Reuse the message-level translation cache so the same content doesn't
  // get translated twice (e.g. by both auto-translate and the manual
  // bubble action).
  const { data: msg } = await admin
    .from("messages")
    .select("metadata")
    .eq("id", args.messageId)
    .maybeSingle();
  const cache = (msg?.metadata as { translation_cache?: Record<string, string> } | null)
    ?.translation_cache;
  if (cache?.[target]) {
    // Already translated — just mark it as auto so the UI knows to render
    // the translated version by default.
    const newMetadata = {
      ...(msg?.metadata ?? {}),
      auto_translation: {
        source: sourceIso,
        target,
        text: cache[target],
      },
    };
    await admin
      .from("messages")
      .update({ metadata: newMetadata })
      .eq("id", args.messageId);
    return;
  }

  // Translate via Haiku (cheap + fast).
  try {
    const anthropic = getAnthropic();
    const completion = await anthropic.messages.create({
      model: MODELS.rewrite,
      max_tokens: Math.min(1024, Math.max(256, args.content.length)),
      system: `Translate the message to ${target}. Preserve tone, line breaks, and any proper nouns / product names. Return ONLY the translation, no preamble.`,
      messages: [{ role: "user", content: args.content }],
    });
    const translated = completion.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("")
      .trim();
    if (!translated) return;
    const newCache = { ...(cache ?? {}), [target]: translated };
    const newMetadata = {
      ...(msg?.metadata ?? {}),
      translation_cache: newCache,
      auto_translation: { source: sourceIso, target, text: translated },
    };
    await admin
      .from("messages")
      .update({ metadata: newMetadata })
      .eq("id", args.messageId);
  } catch (err) {
    console.warn("[auto-translate] threw", err);
  }
}
