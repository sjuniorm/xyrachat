import "server-only";
import { toFile } from "openai";
import { getOpenAI, MODELS, isOpenAIConfigured } from "@/lib/ai/clients";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchProviderMedia } from "@/lib/ai/provider-media";

// =====================================================================
// Voice-note transcription. Downloads the inbound audio (SSRF-safe, shared
// provider-media), runs OpenAI Whisper, returns the transcript. Whisper has no
// token-usage object, so we charge the org AI budget by audio DURATION
// (verbose_json returns it) mapped to a token-equivalent, capped per message.
// =====================================================================

type AdminClient = ReturnType<typeof createAdminClient>;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper hard limit is 25 MB
// Cost proxy: Whisper (~$0.006/min ≈ $0.0001/s) vs Sonnet input (~$3/1M tok).
// ~30 token-equivalents per audio second keeps the budget charge cost-honest.
const TOKENS_PER_AUDIO_SECOND = 30;
// Ceiling on a single voice note's budget charge (~3.5 min equivalent) so one
// long/abusive note can't exhaust an org's whole monthly AI budget at once.
const MAX_TRANSCRIPTION_BUDGET_TOKENS = 6000;

export type TranscriptionResult = {
  text: string;
  model: string;
  durationSec: number;
  budgetTokens: number; // charge this against the org AI budget
};

// Whisper infers format from the filename extension; map the downloaded mime.
function extFromMime(mime: string | null | undefined): string {
  switch ((mime ?? "").split(";")[0].trim()) {
    case "audio/ogg":
    case "audio/opus":
      return "ogg";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      return "m4a";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/webm":
      return "webm";
    case "audio/flac":
    case "audio/x-flac":
      return "flac";
    default:
      // WA/Telegram voice notes are opus-in-ogg; unknown mimes fall here and
      // fail the Whisper call → caught → null, rather than claim a bogus ext.
      return "ogg";
  }
}

// Resolve + transcribe an inbound audio message. Returns null on any failure
// (unconfigured, download error, empty transcript) — callers degrade quietly.
export async function transcribeInboundAudio(params: {
  channelType: string;
  channelId: string;
  mediaRef: string; // messages.media_url (media_id / file_id / url)
  admin: AdminClient;
}): Promise<TranscriptionResult | null> {
  const { channelType, channelId, mediaRef, admin } = params;
  if (!isOpenAIConfigured() || !mediaRef) return null;

  let media;
  try {
    media = await fetchProviderMedia(channelType, channelId, mediaRef, admin, MAX_AUDIO_BYTES);
  } catch (err) {
    console.warn("[transcription] media download failed", { channelType, err });
    return null;
  }
  if (!media || media.bytes.byteLength === 0) return null;

  try {
    const openai = getOpenAI();
    const file = await toFile(Buffer.from(media.bytes), `voice.${extFromMime(media.mime)}`);
    const res = (await openai.audio.transcriptions.create({
      file,
      model: MODELS.transcription,
      response_format: "verbose_json",
    })) as { text?: string; duration?: number };
    const text = (res.text ?? "").trim();
    if (!text) return null;
    const durationSec = typeof res.duration === "number" ? res.duration : 0;
    return {
      text,
      model: MODELS.transcription,
      durationSec,
      budgetTokens: Math.min(
        MAX_TRANSCRIPTION_BUDGET_TOKENS,
        Math.max(1, Math.ceil(durationSec * TOKENS_PER_AUDIO_SECOND)),
      ),
    };
  } catch (err) {
    console.warn("[transcription] Whisper call failed", err);
    return null;
  }
}
