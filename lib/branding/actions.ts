"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

// Save white-label branding (owner/admin). Stored regardless of entitlement so
// the owner can pre-configure; it only takes EFFECT when the org is entitled to
// feature:whitelabel (enforced in lib/branding/server.ts getEffectiveBranding).
export async function updateBranding(input: {
  brandName?: string;
  logoUrl?: string;
  accentColor?: string;
  hidePoweredBy?: boolean;
}): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: me } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me?.org_id) return { ok: false, error: "Not in an org." };
  if (me.role !== "owner" && me.role !== "admin") {
    return { ok: false, error: "Only owners and admins can change branding." };
  }

  const brandName = (input.brandName ?? "").trim().slice(0, 60);
  const logoUrl = (input.logoUrl ?? "").trim();
  const accentColor = (input.accentColor ?? "").trim();
  if (logoUrl && !logoUrl.startsWith("https://")) {
    return { ok: false, error: "Logo URL must start with https://." };
  }
  if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
    return { ok: false, error: "Accent color must be a hex value like #9333EA." };
  }

  const branding = {
    brand_name: brandName || null,
    logo_url: logoUrl || null,
    accent_color: accentColor || null,
    hide_powered_by: input.hidePoweredBy === true,
  };

  const admin = createAdminClient();
  const { error } = await admin.from("organizations").update({ branding }).eq("id", me.org_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/branding");
  return { ok: true };
}
