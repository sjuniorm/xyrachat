import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchProviderMedia } from "@/lib/ai/provider-media";

// =====================================================================
// Inbound image understanding. Downloads an inbound image (SSRF-safe, shared
// provider-media) and base64-encodes it for an Anthropic vision content block,
// so the bot can answer about a screenshot/photo. Claude (claude-sonnet-4-6)
// supports vision; only the formats it accepts are passed through.
// =====================================================================

type AdminClient = ReturnType<typeof createAdminClient>;

// Anthropic-supported image formats.
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
// Anthropic's per-image limit is ~5 MB (base64-encoded grows ~33%, but the
// raw cap keeps us comfortably under both the request + image limits).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type InboundImage = { base64: string; mime: string };

// Returns null on any failure (download error, unsupported format, oversized)
// so the caller degrades to a text-only / no-op path.
export async function prepareInboundImage(params: {
  channelType: string;
  channelId: string;
  mediaRef: string; // messages.media_url (media_id / file_id / url)
  admin: AdminClient;
}): Promise<InboundImage | null> {
  const { channelType, channelId, mediaRef, admin } = params;
  if (!mediaRef) return null;

  let media;
  try {
    media = await fetchProviderMedia(channelType, channelId, mediaRef, admin, MAX_IMAGE_BYTES);
  } catch (err) {
    console.warn("[vision] image download failed", { channelType, err });
    return null;
  }
  if (!media || media.bytes.byteLength === 0) return null;

  const mime = media.mime.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(mime)) return null;

  return { base64: Buffer.from(media.bytes).toString("base64"), mime };
}
