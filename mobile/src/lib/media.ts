const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL;

// Outbound app media is stored as a RELATIVE /api/media/... proxy path against a
// PRIVATE Storage bucket — it needs an absolute URL + the signed-in user's
// bearer token to load. Inbound provider/CDN media URLs are already absolute
// and public, so they're used as-is. Shaped for expo-image's <Image source>.
export function mediaImageSource(
  mediaUrl: string,
  accessToken?: string | null,
): { uri: string; headers?: Record<string, string> } {
  if (mediaUrl.startsWith("/api/media/")) {
    return {
      uri: `${API_BASE ?? ""}${mediaUrl}`,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    };
  }
  return { uri: mediaUrl };
}
