import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { CrmProvider, OAuthTokens } from "./types";
import { hubspotConfigured, buildHubspotAuthUrl, exchangeHubspotCode } from "./hubspot";
import { saveCrmConnection } from "./connections";

// Shared start/finish for the CRM OAuth callbacks (mirrors lib/calendar/oauth-flow).
// Owner/admin only; CSRF via a httpOnly state-nonce cookie verified on callback.

const SETTINGS = "/settings/crm";

function stateCookie(provider: CrmProvider): string {
  return `crm_state_${provider}`;
}
function isConfigured(provider: CrmProvider): boolean {
  return provider === "hubspot" ? hubspotConfigured() : false;
}
function authUrl(provider: CrmProvider, state: string): string {
  return provider === "hubspot" ? buildHubspotAuthUrl(state) : "";
}
async function exchange(provider: CrmProvider, code: string): Promise<OAuthTokens> {
  if (provider === "hubspot") return exchangeHubspotCode(code);
  throw new Error("Unsupported CRM provider");
}

async function ownerAdminOrg(): Promise<{ orgId: string; userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!me?.org_id || (me.role !== "owner" && me.role !== "admin")) return null;
  return { orgId: me.org_id, userId: user.id };
}

export async function startCrmOAuth(provider: CrmProvider): Promise<string> {
  if (!isConfigured(provider)) return `${SETTINGS}?error=not_configured`;
  const auth = await ownerAdminOrg();
  if (!auth) return `${SETTINGS}?error=forbidden`;
  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set(stateCookie(provider), state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return authUrl(provider, state);
}

export async function finishCrmOAuth(req: Request, provider: CrmProvider): Promise<string> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerErr = url.searchParams.get("error");

  const jar = await cookies();
  const expected = jar.get(stateCookie(provider))?.value;
  jar.delete(stateCookie(provider));

  if (providerErr) {
    const desc = url.searchParams.get("error_description");
    console.error(`[crm oauth ${provider}] provider error:`, providerErr, desc);
    return `${SETTINGS}?error=${encodeURIComponent(desc ? `${providerErr} — ${desc.slice(0, 200)}` : providerErr)}`;
  }
  if (!code || !state || !expected || state !== expected) return `${SETTINGS}?error=state_mismatch`;

  const auth = await ownerAdminOrg();
  if (!auth) return `${SETTINGS}?error=forbidden`;

  try {
    const tokens = await exchange(provider, code);
    await saveCrmConnection({ orgId: auth.orgId, provider, connectedBy: auth.userId, tokens });
    return `${SETTINGS}?connected=${provider}`;
  } catch (err) {
    console.error(`[crm oauth ${provider}] exchange/save failed:`, err);
    return `${SETTINGS}?error=${encodeURIComponent(err instanceof Error ? err.message : "connect_failed")}`;
  }
}
