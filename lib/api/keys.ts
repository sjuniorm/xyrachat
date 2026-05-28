import "server-only";
import { createHash, randomBytes } from "crypto";

// Generate a fresh API key. Plaintext is shown once at creation and never
// stored — only the SHA-256 hash + a display prefix go to the DB.
//
// Format: xyra_live_<24 url-safe random chars>
// Example: xyra_live_xK4qZ8c7vY2T9rF6mN1a3bWp
//
// `live` is the only flavour today; we keep the prefix structured so test
// keys (xyra_test_...) can land later without breaking parsers.
export function generateApiKey(): { plaintext: string; prefix: string } {
  const random = randomBytes(18).toString("base64url"); // ~24 chars
  const plaintext = `xyra_live_${random}`;
  // First 16 chars = "xyra_live_" + 6 of the random body.
  const prefix = plaintext.slice(0, 16);
  return { plaintext, prefix };
}

// SHA-256(plaintext + APP_PEPPER). The pepper is an env-only secret —
// a leaked DB without the pepper still can't validate keys.
//
// We compare hashes via constant-time equality in the lookup path.
// Bcrypt was the alternative but with SHA-256 + pepper we can lookup
// via index (UNIQUE on key_hash) which is much cheaper at request time.
// SHA-256 is fine for high-entropy keys; bcrypt is for low-entropy
// human passwords.
export function hashApiKey(plaintext: string): string {
  const pepper = process.env.APP_PEPPER;
  if (!pepper) {
    throw new Error("APP_PEPPER env var is required to hash API keys.");
  }
  return createHash("sha256").update(`${plaintext}${pepper}`).digest("hex");
}
