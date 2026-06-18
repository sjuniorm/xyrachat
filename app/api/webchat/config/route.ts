import { NextResponse } from "next/server";
import { WEBCHAT_CORS, isWebchatKey, resolveWebchatChannel } from "@/lib/webchat/server";
import { getEffectiveBranding } from "@/lib/branding/server";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: WEBCHAT_CORS });
}

// GET ?k= → public widget appearance. No visitor needed; safe for any origin.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  if (!isWebchatKey(k)) {
    return NextResponse.json({ error: "Bad key" }, { status: 400, headers: WEBCHAT_CORS });
  }
  const channel = await resolveWebchatChannel(k);
  if (!channel) {
    return NextResponse.json({ error: "Unknown channel" }, { status: 404, headers: WEBCHAT_CORS });
  }
  const cfg = ((channel.metadata as { webchat?: Record<string, string> } | null)?.webchat) ?? {};
  // White-label branding (gated on feature:whitelabel — falls back to Xyra).
  const brand = await getEffectiveBranding(channel.org_id);
  // color: per-channel setting, else the white-label accent, else Xyra purple.
  // Injected into the widget's <style> — only ever emit a strict hex.
  const channelColor =
    typeof cfg.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(cfg.color) ? cfg.color : null;
  const color = channelColor ?? brand.accentColor ?? "#9333EA";
  // "Powered by" line: hidden when white-label + hide_powered_by; otherwise the
  // brand name (white-label) or "Xyra Chat".
  const poweredBy = brand.whitelabel && brand.hidePoweredBy ? null : brand.brandName;
  return NextResponse.json(
    {
      title: cfg.title || "Chat with us",
      greeting: cfg.greeting || "Hi! 👋 How can we help?",
      color,
      launcher_text: cfg.launcher_text || "Chat",
      powered_by: poweredBy,
    },
    { headers: { ...WEBCHAT_CORS, "Cache-Control": "public, max-age=300" } },
  );
}
