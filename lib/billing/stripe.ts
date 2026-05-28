import "server-only";
import Stripe from "stripe";
import { BUNDLES, type BundleId } from "./bundles";

// Lazy singleton — avoids initialising the SDK at module-load time so
// Next.js builds without STRIPE_SECRET_KEY don't crash on import.
let _client: Stripe | null = null;

export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Stripe operations require it.",
    );
  }
  _client = new Stripe(key, {
    // Pin the API version — Stripe defaults to the version active when
    // your account was created. Pinning means SDK upgrades don't change
    // server behaviour silently.
    apiVersion: "2026-05-27.dahlia",
    typescript: true,
    appInfo: {
      name: "XyraChat",
      version: "1.0.0",
      url: "https://xyrachat.com",
    },
  });
  return _client;
}

// Reads the Stripe Price ID for a given bundle from env (so dev/prod can
// use different products without code changes). Falls back to the value
// embedded in BUNDLES (only relevant once we hard-code production IDs).
export function priceIdForBundle(
  bundleId: BundleId,
  interval: "monthly" | "yearly",
): string | null {
  const envKey = `STRIPE_PRICE_${bundleId.toUpperCase()}_${interval.toUpperCase()}`;
  const v = process.env[envKey];
  if (v && v.startsWith("price_")) return v;
  const bundle = BUNDLES[bundleId];
  return interval === "yearly"
    ? bundle.stripePriceIdYearly ?? null
    : bundle.stripePriceIdMonthly ?? null;
}

// Walk every configured Stripe price (across all bundles + intervals)
// and return the matching bundle. Used by the webhook handler.
export function bundleIdFromPriceId(priceId: string): BundleId | null {
  for (const id of Object.keys(BUNDLES) as BundleId[]) {
    if (priceIdForBundle(id, "monthly") === priceId) return id;
    if (priceIdForBundle(id, "yearly") === priceId) return id;
  }
  return null;
}
