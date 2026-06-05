import { defineConfig, devices } from "@playwright/test";

// Smoke-level E2E. These tests cover only UNAUTHENTICATED surfaces + the
// middleware auth gate, so they need no live Supabase project — placeholder
// NEXT_PUBLIC_SUPABASE_* values are enough (no network call happens for an
// anonymous getUser). Authenticated flows that need a seeded test user are a
// follow-up once a throwaway test Supabase project exists.

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Build + serve the app for the test run. Reuse an already-running dev server
  // locally (so `next dev` on :3000 is picked up); always build fresh in CI.
  webServer: {
    command: "npm run build && npm run start",
    url: baseURL,
    timeout: 240_000,
    reuseExistingServer: !isCI,
    env: {
      // Placeholders so the browser Supabase client initializes without a real
      // project. Anonymous requests make no network call, so these never resolve.
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
    },
  },
});
