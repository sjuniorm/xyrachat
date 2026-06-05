import { test, expect } from "@playwright/test";

// Smoke suite: verifies the app boots and the unauthenticated surfaces +
// route protection behave. No live Supabase needed (anonymous requests make no
// auth network call). Assertions lean on stable structure (URLs, input types,
// status codes) rather than exact marketing copy so they don't break on
// wording tweaks.

test.describe("public routes", () => {
  test("landing page renders with sign-in + get-started CTAs", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();
  });

  test("login page renders a sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button")).toBeVisible();
  });

  test("signup page renders", async ({ page }) => {
    const res = await page.goto("/signup");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("forgot-password page renders", async ({ page }) => {
    const res = await page.goto("/forgot-password");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  for (const path of ["/privacy", "/terms"]) {
    test(`${path} renders with content`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.locator("body")).not.toBeEmpty();
    });
  }
});

test.describe("route protection", () => {
  for (const path of ["/dashboard", "/inbox", "/bots", "/settings"]) {
    test(`${path} redirects an anonymous visitor to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  // The middleware gates every route that isn't explicitly public, so an
  // unlisted path also sends an anonymous visitor to /login (no open 404 for
  // protected space — a security-relevant catch-all).
  test("an unlisted route redirects an anonymous visitor to /login", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-xyz");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("health", () => {
  test("GET /api/health responds", async ({ request }) => {
    const res = await request.get("/api/health");
    // 200 when the DB probe is reachable; 503 when it isn't (placeholder env in
    // CI). Either is a valid "the route is wired" signal — we only fail on a crash.
    expect([200, 503]).toContain(res.status());
  });
});
