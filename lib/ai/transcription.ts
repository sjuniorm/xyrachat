import "server-only";
import { toFile } from "openai";
import { getOpenAI, MODELS, isOpenAIConfigured } from "@/lib/ai/clients";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { createAdminClient } from "@/lib/supabase/admin";

// =====================================================================
// Voice-note transcription. Inbound audio is stored as messages.media_type=
// 'audio' + messages.media_url holding a PROVIDER-SPECIFIC reference:
//   WhatsApp  → a Meta media_id (2-step Graph resolve, Bearer on both calls)
//   Telegram  → a file_id (getFile → /file/bot<token>/<path>)
//   Instagram → an already-fetchable signed CDN url (1-step)
// We download the bytes, run OpenAI Whisper, and return the transcript.
//
// Whisper has no token-usage object, so we charge the org AI budget by audio
// DURATION (verbose_json returns it) mapped to a token-equivalent.
// =====================================================================

type AdminClient = ReturnType<typeof createAdminClient>;

const META_GRAPH_VERSION = "v22.0";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper hard limit is 25 MB
const FETCH_TIMEOUT_MS = 20_000;
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

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

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
    default:
      // Whisper accepts ogg/oga (WA + Telegram voice notes are opus-in-ogg).
      // Unknown/unsupported mimes (e.g. AMR) fall here and will simply fail
      // the Whisper call → caught → null, rather than claim a bogus extension.
      return "ogg";
  }
}

function extFromPath(path: string): string | null {
  const m = path.split("?")[0].match(/\.([a-z0-9]{2,4})$/i);
  return m ? m[1].toLowerCase() : null;
}

async function channelToken(
  channelId: string,
  admin: AdminClient,
): Promise<string | null> {
  const { data: channel } = await admin
    .from("channels")
    .select("access_token_vault_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel?.access_token_vault_id) return null;
  return vaultReadSecret(channel.access_token_vault_id).catch(() => null);
}

// ---------------------------------------------------------------------
// SSRF defense: media downloads only ever hit known Meta / Telegram hosts.
// We never fetch an arbitrary stored URL, never put a token in a query
// string, and never follow a redirect to a non-allowlisted host (and drop
// credentials across hops). Even though media references come from
// HMAC-verified webhooks, this is defense-in-depth against a poisoned
// media_url or an open-redirect pivot.
// ---------------------------------------------------------------------
type HostAllow = { exact?: string[]; suffix?: string[] };
const META_API: HostAllow = { exact: ["graph.facebook.com"] };
const META_CDN: HostAllow = { suffix: [".fbsbx.com", ".cdninstagram.com", ".fbcdn.net"] };
const TELEGRAM: HostAllow = { exact: ["api.telegram.org"] };

function hostAllowed(rawUrl: string, allow: HostAllow): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (allow.exact?.includes(host)) return true;
  // Leading-dot suffixes so "evilcdninstagram.com" can't match ".cdninstagram.com".
  if (allow.suffix?.some((s) => host.endsWith(s))) return true;
  return false;
}

// Fetch that validates every hop's host against an allowlist, refuses to
// leave it, and strips credentials on redirect.
async function safeMediaFetch(
  rawUrl: string,
  allow: HostAllow,
  init: RequestInit = {},
  hops = 3,
): Promise<Response | null> {
  let url = rawUrl;
  let headers = init.headers;
  for (let i = 0; i < hops; i++) {
    if (!hostAllowed(url, allow)) return null;
    const res = await fetchWithTimeout(url, { ...init, headers, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      url = new URL(loc, url).toString();
      headers = undefined; // never forward auth across a redirect hop
      continue;
    }
    return res;
  }
  return null; // too many redirects
}

// Read a response body but reject oversized payloads. Checks Content-Length
// FIRST (so a declared-large body isn't allocated at all), then backstops with
// a post-read check in case the header is missing or lying.
async function readBytesCapped(
  res: Response,
  maxBytes: number,
): Promise<ArrayBuffer | null> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null;
  return bytes;
}

type AudioBytes = { bytes: ArrayBuffer; filename: string };

async function downloadWhatsAppAudio(
  mediaId: string,
  channelId: string,
  admin: AdminClient,
): Promise<AudioBytes | null> {
  const token = await channelToken(channelId, admin);
  if (!token) return null;
  const auth = { Authorization: `Bearer ${token}` };
  // Step 1: media_id → short-lived URL + mime (graph.facebook.com).
  const metaRes = await safeMediaFetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(mediaId)}`,
    META_API,
    { headers: auth },
  );
  if (!metaRes || !metaRes.ok) return null;
  const meta = (await metaRes.json().catch(() => null)) as
    | { url?: string; mime_type?: string }
    | null;
  if (!meta?.url) return null;
  // Step 2: fetch the bytes from the Meta CDN (Bearer required; host checked).
  const binRes = await safeMediaFetch(meta.url, META_CDN, { headers: auth });
  if (!binRes || !binRes.ok) return null;
  const bytes = await readBytesCapped(binRes, MAX_AUDIO_BYTES);
  if (!bytes) return null;
  return { bytes, filename: `voice.${extFromMime(meta.mime_type)}` };
}

async function downloadTelegramAudio(
  fileId: string,
  channelId: string,
  admin: AdminClient,
): Promise<AudioBytes | null> {
  const token = await channelToken(channelId, admin);
  if (!token) return null;
  // Step 1: file_id → file_path. Token is in the path per Telegram's API; the
  // host is fixed + allowlisted and redirects are host-checked, so it can't
  // be steered off api.telegram.org.
  const fileRes = await safeMediaFetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    TELEGRAM,
  );
  if (!fileRes || !fileRes.ok) return null;
  const fileJson = (await fileRes.json().catch(() => null)) as
    | { ok?: boolean; result?: { file_path?: string } }
    | null;
  const filePath = fileJson?.result?.file_path;
  if (!filePath) return null;
  // Step 2: download the bytes.
  const binRes = await safeMediaFetch(
    `https://api.telegram.org/file/bot${token}/${filePath}`,
    TELEGRAM,
  );
  if (!binRes || !binRes.ok) return null;
  const bytes = await readBytesCapped(binRes, MAX_AUDIO_BYTES);
  if (!bytes) return null;
  const ext = extFromPath(filePath) ?? "ogg";
  return { bytes, filename: `voice.${ext}` };
}

async function downloadInstagramAudio(
  url: string,
  channelId: string,
  admin: AdminClient,
): Promise<AudioBytes | null> {
  // IG inbound audio url is a pre-signed Meta CDN url — plain GET, host-checked.
  // Reject anything not on a Meta CDN host (SSRF guard on the stored url).
  if (!hostAllowed(url, META_CDN)) return null;
  let res = await safeMediaFetch(url, META_CDN);
  if (res && (res.status === 401 || res.status === 403)) {
    // Rare auth fallback: retry with the token in an Authorization HEADER
    // (never a query string), to the SAME already-validated host.
    const token = await channelToken(channelId, admin);
    if (token) {
      res = await safeMediaFetch(url, META_CDN, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }
  if (!res || !res.ok) return null;
  const bytes = await readBytesCapped(res, MAX_AUDIO_BYTES);
  if (!bytes) return null;
  const ext = extFromPath(url) ?? "mp4";
  return { bytes, filename: `voice.${ext}` };
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

  let dl: AudioBytes | null = null;
  try {
    if (channelType === "whatsapp") {
      dl = await downloadWhatsAppAudio(mediaRef, channelId, admin);
    } else if (channelType === "telegram") {
      dl = await downloadTelegramAudio(mediaRef, channelId, admin);
    } else if (channelType === "instagram") {
      dl = await downloadInstagramAudio(mediaRef, channelId, admin);
    }
  } catch (err) {
    console.warn("[transcription] media download failed", { channelType, err });
    return null;
  }
  if (!dl || dl.bytes.byteLength === 0) return null; // size already capped on download

  try {
    const openai = getOpenAI();
    const file = await toFile(Buffer.from(dl.bytes), dl.filename);
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
      // Cap the per-message charge so one long note can't swallow a whole
      // monthly budget (still proportional for normal-length notes).
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
