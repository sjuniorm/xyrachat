import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeature } from "@/lib/billing/entitlements";

// White-label branding. ALWAYS gated on the feature:whitelabel entitlement — a
// non-entitled org falls back to Xyra branding even if branding rows exist, so
// downgrading cleanly reverts. Empty {} = Xyra defaults.

export type Branding = {
  whitelabel: boolean; // is the org entitled to white-label?
  brandName: string; // shown to customers; defaults to "Xyra Chat"
  logoUrl: string | null;
  accentColor: string | null; // hex; null = use the channel/default color
  hidePoweredBy: boolean; // hide/replace "Powered by Xyra Chat" in the widget
};

const DEFAULTS: Omit<Branding, "whitelabel"> = {
  brandName: "Xyra Chat",
  logoUrl: null,
  accentColor: null,
  hidePoweredBy: false,
};

function hexOrNull(v: unknown): string | null {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
}

// Raw stored branding (for the SETTINGS form — shows what's saved regardless of
// entitlement, so the owner can configure before/after upgrading).
export async function getStoredBranding(orgId: string): Promise<Omit<Branding, "whitelabel">> {
  const admin = createAdminClient();
  const { data } = await admin.from("organizations").select("branding").eq("id", orgId).maybeSingle();
  const r = (data?.branding ?? {}) as Record<string, unknown>;
  return {
    brandName: typeof r.brand_name === "string" && r.brand_name.trim() ? r.brand_name.trim().slice(0, 60) : DEFAULTS.brandName,
    logoUrl: typeof r.logo_url === "string" && r.logo_url.startsWith("https://") ? r.logo_url : null,
    accentColor: hexOrNull(r.accent_color),
    hidePoweredBy: r.hide_powered_by === true,
  };
}

// EFFECTIVE branding — what customers should actually see. Falls back to Xyra
// defaults unless the org is entitled to white-label.
export async function getEffectiveBranding(orgId: string): Promise<Branding> {
  const whitelabel = await hasFeature(orgId, "feature:whitelabel");
  if (!whitelabel) return { whitelabel: false, ...DEFAULTS };
  const stored = await getStoredBranding(orgId);
  return { whitelabel: true, ...stored };
}
