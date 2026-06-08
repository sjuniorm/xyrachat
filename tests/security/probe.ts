/**
 * FINAL security pass — §15 adversarial probe.
 *
 * Hits a LIVE deployment as a hostile attacker and asserts the security
 * properties. Run against STAGING (not prod), e.g.:
 *
 *   PROBE_BASE_URL=https://staging.xyrachat.com \
 *   PROBE_A_JWT=<org-A supabase access_token> PROBE_A_CONV=<org-A conversation id> \
 *   PROBE_B_JWT=<org-B supabase access_token> \
 *   PROBE_A_APIKEY=<org-A xyra_live_ key> PROBE_RO_APIKEY=<read-only key> \
 *   npx tsx tests/security/probe.ts
 *
 * Unauthenticated checks run with NO creds. Cross-tenant / mass-assignment /
 * rate-limit / API-key checks activate only when the matching env is provided
 * (grab the JWT from the browser devtools → Application → Local Storage →
 * sb-*-auth-token → access_token, or from supabase.auth.getSession()).
 *
 * Manual-only checks (prompt-injection leak, XSS-in-fields rendering, DNS
 * rebinding) are listed at the end — verify those by hand / with the static
 * audit. This script automates the deterministic ones.
 */

const BASE = (process.env.PROBE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const A_JWT = process.env.PROBE_A_JWT;
const B_JWT = process.env.PROBE_B_JWT;
const A_CONV = process.env.PROBE_A_CONV; // an org-A conversation id
const A_APIKEY = process.env.PROBE_A_APIKEY;
const RO_APIKEY = process.env.PROBE_RO_APIKEY; // a read-only-scoped key

let pass = 0;
let fail = 0;
let skip = 0;

function ok(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
function skipped(name: string, why: string) {
  skip++;
  console.log(`  ⚪ ${name}  (skipped: ${why})`);
}

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, { redirect: "manual", ...init });
}
const bearer = (jwt: string) => ({ Authorization: `Bearer ${jwt}` });

async function main() {
  console.log(`\n🔒 Xyra Chat security probe → ${BASE}\n`);

  // ── A. Unauthenticated — no creds needed ──────────────────────────────
  console.log("A. Unauthenticated access");
  for (const path of [
    "/api/v1/contacts",
    "/api/v1/conversations",
    "/api/launch-check",
    "/api/billing/checkout",
    "/api/channels/whatsapp/send",
  ]) {
    const r = await req(path, { method: path.includes("/v1/") ? "GET" : "POST" });
    ok(`${path} without auth → 401/403 (not 200)`, r.status === 401 || r.status === 403, `got ${r.status}`);
  }

  // Empty / malformed body must 4xx, never 500
  for (const path of ["/api/billing/checkout", "/api/ai/message-assist", "/api/support/chat"]) {
    const r = await req(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "" });
    ok(`${path} empty body → not 500`, r.status !== 500, `got ${r.status}`);
  }

  // Webhooks: missing / bad signature must be rejected, never 500
  {
    const r = await req("/api/webhooks/stripe", { method: "POST", body: "{}" });
    ok("Stripe webhook, no signature → 400/401 (not 500/200)", [400, 401].includes(r.status), `got ${r.status}`);
    const r2 = await req("/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=deadbeef", "Content-Type": "application/json" },
      body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
    });
    ok("WhatsApp webhook, bad signature → 401 (not 200)", r2.status === 401, `got ${r2.status}`);
  }

  // CSP report endpoint is public + tolerant
  {
    const r = await req("/api/security/csp-report", { method: "POST", body: "{}" });
    ok("CSP report endpoint accepts a report (2xx)", r.status >= 200 && r.status < 300, `got ${r.status}`);
  }

  // ── B. Cross-tenant isolation (needs two org JWTs) ────────────────────
  console.log("\nB. Cross-tenant isolation");
  if (B_JWT && A_CONV) {
    const r = await req(`/api/v1/conversations/${A_CONV}`, { headers: bearer(B_JWT) });
    ok("org B reading org A conversation → 404/403", r.status === 404 || r.status === 403, `got ${r.status}`);
    const r2 = await req(`/api/v1/conversations/${A_CONV}/messages`, {
      method: "POST",
      headers: { ...bearer(B_JWT), "Content-Type": "application/json" },
      body: JSON.stringify({ content: "x", type: "text" }),
    });
    ok("org B writing to org A conversation → 4xx", r2.status >= 400 && r2.status < 500, `got ${r2.status}`);
  } else {
    skipped("cross-tenant read/write", "set PROBE_B_JWT + PROBE_A_CONV");
  }

  // ── C. Mass assignment / privilege escalation (needs org A JWT) ───────
  console.log("\nC. Mass assignment");
  if (A_JWT) {
    // Try to grant self owner / move org via the contacts update (any write that
    // takes a body) — protected fields must be ignored, never applied.
    const r = await req("/api/v1/me", { headers: bearer(A_JWT) });
    const me = (await r.json().catch(() => null)) as { org_id?: string } | null;
    ok("GET /api/v1/me works with JWT", r.status === 200 && !!me, `got ${r.status}`);
    // (Profile role/org_id is not exposed via a v1 PATCH; the DB column-grant
    //  blocks it at the RLS layer. Confirmed in the static audit — see CLAUDE.md.)
    skipped("profile role/org_id escalation", "no client PATCH path exists (column-grant blocks it); verify in static audit");
  } else {
    skipped("mass assignment", "set PROBE_A_JWT");
  }

  // ── D. Rate limiting (needs org A JWT) ────────────────────────────────
  console.log("\nD. Rate limiting");
  if (A_JWT) {
    const N = 60;
    const codes = await Promise.all(
      Array.from({ length: N }, () =>
        req("/api/ai/message-assist", {
          method: "POST",
          headers: { ...bearer(A_JWT), "Content-Type": "application/json" },
          body: JSON.stringify({ text: "hi", action: "improve" }),
        }).then((r) => r.status),
      ),
    );
    const limited = codes.filter((c) => c === 429).length;
    ok(`${N}× /api/ai/message-assist → some 429 (needs Upstash configured)`, limited > 0, `${limited}/${N} were 429 — if 0, Upstash isn't set (rate limit fails open)`);
  } else {
    skipped("rate limiting", "set PROBE_A_JWT");
  }

  // ── E. API keys (needs org A key + a read-only key) ───────────────────
  console.log("\nE. API key scoping");
  if (A_APIKEY) {
    const r = await req("/api/v1/me", { headers: bearer(A_APIKEY) });
    ok("valid API key → 200 on /api/v1/me", r.status === 200, `got ${r.status}`);
    const r2 = await req("/api/v1/me", { headers: bearer(A_APIKEY.slice(0, -3) + "xxx") });
    ok("tampered API key → 401", r2.status === 401, `got ${r2.status}`);
  } else {
    skipped("API key auth", "set PROBE_A_APIKEY");
  }
  if (RO_APIKEY) {
    const r = await req("/api/v1/contacts", {
      method: "POST",
      headers: { ...bearer(RO_APIKEY), "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+10000000000" }),
    });
    ok("read-only key writing → 403", r.status === 403, `got ${r.status}`);
  } else {
    skipped("read-only scope enforcement", "set PROBE_RO_APIKEY");
  }

  // ── F. SSRF on webhook subscribe (needs org A key) ────────────────────
  console.log("\nF. SSRF guard");
  if (A_APIKEY) {
    for (const url of ["http://169.254.169.254/latest/meta-data/", "http://localhost:3000/x", "http://127.0.0.1/x"]) {
      const r = await req("/api/v1/webhooks/subscribe", {
        method: "POST",
        headers: { ...bearer(A_APIKEY), "Content-Type": "application/json" },
        body: JSON.stringify({ url, events: ["message.received"] }),
      });
      ok(`webhook → ${url} rejected (4xx)`, r.status >= 400 && r.status < 500, `got ${r.status}`);
    }
  } else {
    skipped("SSRF webhook subscribe", "set PROBE_A_APIKEY");
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n────────\n✅ ${pass}  ❌ ${fail}  ⚪ ${skip}\n`);
  console.log(
    "Manual / static-only checks (not automated here): prompt-injection system-prompt leak, " +
      "XSS rendering in contact name / bot name / message body, inbound-email HTML execution, " +
      "DNS-rebinding on webhook delivery, Stripe price_id tampering, trial re-signup uniqueness. " +
      "These are covered by the static audit — see CLAUDE.md Security Audit Log.",
  );
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("probe crashed:", e);
  process.exit(2);
});
