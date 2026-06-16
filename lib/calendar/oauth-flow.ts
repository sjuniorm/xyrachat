import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { CalendarProvider, OAuthTokens } from "./types";
import { googleConfigured, buildGoogleAuthUrl, exchangeGoogleCode } from "./google";
import { microsoftConfigured, buildMicrosoftAuthUrl, exchangeMicrosoftCode } from "./microsoft";
import { saveCalendarConnection } from "./connections";

// Shared start/finish logic for the Google + Microsoft calendar OAuth callbacks,
// so the 4 route handlers stay one-liners. Owner/admin only; CSRF via a
// httpOnly state-nonce cookie verified on the callback.

const SETTINGS = "/settings/calendar";

function stateCookie(provider: CalendarProvider): string {
  return provider === "google" ? "gcal_state" : "mcal_state";
}

function isConfigured(provider: CalendarProvider): boolean {
  return provider === "google" ? googleConfigured() : microsoftConfigured();
}

function authUrl(provider: CalendarProvider, state: string): string {
  return provider === "google" ? buildGoogleAuthUrl(state) : buildMicrosoftAuthUrl(state);
}

async function exchange(provider: CalendarProvider, code: string): Promise<OAuthTokens & { email: string | null }> {
  return provider === "google" ? exchangeGoogleCode(code) : exchangeMicrosoftCode(code);
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

// Returns the URL to redirect the browser to (provider authorize, or settings
// with an error). Sets the CSRF state cookie.
export async function startCalendarOAuth(provider: CalendarProvider): Promise<string> {
  if (!isConfigured(provider)) return `${SETTINGS}?error=not_configured`;
  const auth = await ownerAdminOrg();
  if (!auth) return `${SETTINGS}?error=forbidden`;
  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set(stateCookie(provider), state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return authUrl(provider, state);
}

// Handles the provider redirect back. Returns a settings path with a result
// query param. Verifies state, exchanges the code, stores the connection.
export async function finishCalendarOAuth(req: Request, provider: CalendarProvider): Promise<string> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerErr = url.searchParams.get("error");

  const jar = await cookies();
  const expected = jar.get(stateCookie(provider))?.value;
  jar.delete(stateCookie(provider));

  if (providerErr) return `${SETTINGS}?error=${encodeURIComponent(providerErr)}`;
  if (!code || !state || !expected || state !== expected) return `${SETTINGS}?error=state_mismatch`;

  const auth = await ownerAdminOrg();
  if (!auth) return `${SETTINGS}?error=forbidden`;

  try {
    const tokens = await exchange(provider, code);
    await saveCalendarConnection({
      orgId: auth.orgId,
      provider,
      connectedBy: auth.userId,
      email: tokens.email,
      tokens,
    });
    return `${SETTINGS}?connected=${provider}`;
  } catch (err) {
    return `${SETTINGS}?error=${encodeURIComponent(err instanceof Error ? err.message : "connect_failed")}`;
  }
}
