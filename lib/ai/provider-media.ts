import "server-only";
import { vaultReadSecret } from "@/lib/supabase/vault";
import { createAdminClient } from "@/lib/supabase/admin";

// =====================================================================
// Shared, SSRF-safe download of inbound media (audio for transcription, images
// for bot vision). media_url holds a PROVIDER-SPECIFIC reference:
//   WhatsApp  → a Meta media_id (2-step Graph resolve, Bearer on both calls)
//   Telegram  → a file_id (getFile → /file/bot<token>/<path>)
//   Instagram → an already-fetchable signed CDN url (1-step)
//
// SECURITY: downloads only ever hit known Meta / Telegram hosts; we never
// fetch an arbitrary stored URL, never put a token in a query string, never
// follow a redirect to a non-allowlisted host (and drop credentials across
// hops). Defense-in-depth against a poisoned media_url / open-redirect pivot.
// =====================================================================

type AdminClient = ReturnType<typeof createAdminClient>;

const META_GRAPH_VERSION = "v22.0";
const FETCH_TIMEOUT_MS = 20_000;

export type ProviderMedia = { bytes: ArrayBuffer; mime: string };

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

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

// Validates every hop's host against an allowlist, refuses to leave it, and
// strips credentials on redirect.
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

// Reject oversized payloads: Content-Length pre-check (avoids allocating a
// declared-large body) + a post-read backstop.
async function readBytesCapped(res: Response, maxBytes: number): Promise<ArrayBuffer | null> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null;
  return bytes;
}

async function channelToken(channelId: string, admin: AdminClient): Promise<string | null> {
  const { data: channel } = await admin
    .from("channels")
    .select("access_token_vault_id")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel?.access_token_vault_id) return null;
  return vaultReadSecret(channel.access_token_vault_id).catch(() => null);
}

function mimeFromPath(path: string): string | null {
  const ext = path.split("?")[0].match(/\.([a-z0-9]{2,4})$/i)?.[1]?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "mp3":
    case "mpga":
    case "mpeg":
      return "audio/mpeg";
    case "m4a":
    // .mp4 here only ever feeds the audio (transcription) or image (vision,
    // which rejects non-image) consumers — never a video path — so treat a
    // file-path .mp4 as audio so it doesn't collapse to a bogus .ogg.
    case "mp4":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "webm":
      return "audio/webm";
    case "flac":
      return "audio/flac";
    default:
      return null;
  }
}

// Download inbound media bytes + mime for any supported provider. Returns null
// on any failure (unconfigured, blocked host, oversized, error) — callers
// degrade quietly. `maxBytes` caps the download.
export async function fetchProviderMedia(
  channelType: string,
  channelId: string,
  mediaRef: string,
  admin: AdminClient,
  maxBytes: number,
): Promise<ProviderMedia | null> {
  if (!mediaRef) return null;

  if (channelType === "whatsapp") {
    const token = await channelToken(channelId, admin);
    if (!token) return null;
    const auth = { Authorization: `Bearer ${token}` };
    const metaRes = await safeMediaFetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(mediaRef)}`,
      META_API,
      { headers: auth },
    );
    if (!metaRes || !metaRes.ok) return null;
    const meta = (await metaRes.json().catch(() => null)) as
      | { url?: string; mime_type?: string }
      | null;
    if (!meta?.url) return null;
    const binRes = await safeMediaFetch(meta.url, META_CDN, { headers: auth });
    if (!binRes || !binRes.ok) return null;
    const bytes = await readBytesCapped(binRes, maxBytes);
    if (!bytes) return null;
    return { bytes, mime: (meta.mime_type ?? "application/octet-stream").split(";")[0].trim() };
  }

  if (channelType === "telegram") {
    const token = await channelToken(channelId, admin);
    if (!token) return null;
    const fileRes = await safeMediaFetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(mediaRef)}`,
      TELEGRAM,
    );
    if (!fileRes || !fileRes.ok) return null;
    const fileJson = (await fileRes.json().catch(() => null)) as
      | { result?: { file_path?: string } }
      | null;
    const filePath = fileJson?.result?.file_path;
    if (!filePath) return null;
    const binRes = await safeMediaFetch(
      `https://api.telegram.org/file/bot${token}/${filePath}`,
      TELEGRAM,
    );
    if (!binRes || !binRes.ok) return null;
    const bytes = await readBytesCapped(binRes, maxBytes);
    if (!bytes) return null;
    return { bytes, mime: mimeFromPath(filePath) ?? "application/octet-stream" };
  }

  if (channelType === "instagram") {
    if (!hostAllowed(mediaRef, META_CDN)) return null;
    let res = await safeMediaFetch(mediaRef, META_CDN);
    if (res && (res.status === 401 || res.status === 403)) {
      const token = await channelToken(channelId, admin);
      if (token) {
        res = await safeMediaFetch(mediaRef, META_CDN, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
    if (!res || !res.ok) return null;
    const bytes = await readBytesCapped(res, maxBytes);
    if (!bytes) return null;
    const mime = (res.headers.get("content-type") ?? mimeFromPath(mediaRef) ?? "application/octet-stream")
      .split(";")[0]
      .trim();
    return { bytes, mime };
  }

  return null;
}
