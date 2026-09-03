import { test, expect, type Page } from "@playwright/test";

/**
 * Part H — Login and signup journeys.
 *
 * Password login is mocked at /api/auth/sign-in so preview/CI does not need
 * a real Supabase password user. Session is omitted so the client skips
 * setSession JWT validation.
 */

const HOLD_NEXT = "/book/continue?hold_id=hold-e2e-1";

async function mockPasswordSignIn(page: Page, role = "customer") {
  await page.route("**/api/auth/sign-in", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          user: {
            id: "e2e-user",
            email: "e2e@example.com",
            identities: [{ provider: "email" }],
          },
          identities: [{ provider: "email" }],
          session: null,
        },
      }),
    });
  });
  await page.route("**/api/me/role**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { role } }),
    });
  });
  await page.route("**/api/me/onboarding/complete**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { completed: true } }),
    });
  });
}

async function switchToPasswordLogin(page: Page) {
  const emailTab = page.getByRole("tab", { name: /email/i });
  if (await emailTab.isVisible().catch(() => false)) {
    await emailTab.click();
  }
  const usePassword = page.getByRole("button", { name: /password/i });
  if (await usePassword.isVisible().catch(() => false)) {
    await usePassword.click();
  }
  await expect(page.locator("#login-email")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#login-password")).toBeVisible();
}

test.describe("auth journeys", () => {
  test("password login happy path (mocked)", async ({ page }) => {
    await mockPasswordSignIn(page);
    await page.goto("/login");
    await switchToPasswordLogin(page);
    await page.locator("#login-email").fill("e2e@example.com");
    await page.locator("#login-password").fill("password123");
    await page.getByTestId("login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/bookings/);
  });

  test("forgot / reset navigation preserves next", async ({ page }) => {
    await page.goto(`/login?next=${encodeURIComponent(HOLD_NEXT)}`);
    await switchToPasswordLogin(page);
    await page.getByRole("link", { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    expect(decodeURIComponent(page.url())).toContain("/book/continue");
    expect(page.url()).toMatch(/hold_id/);
    await expect(page.getByRole("heading", { name: /reset password/i })).toBeVisible();
  });

  test("gate-to-booking next param survives login", async ({ page }) => {
    await mockPasswordSignIn(page);
    await page.goto(`/login?next=${encodeURIComponent(HOLD_NEXT)}`);
    await expect(page).toHaveURL(/next=/);
    expect(decodeURIComponent(page.url())).toContain("/book/continue");
    await switchToPasswordLogin(page);
    await page.locator("#login-email").fill("e2e@example.com");
    await page.locator("#login-password").fill("password123");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/book\/continue/, { timeout: 15_000 });
    expect(page.url()).toMatch(/hold_id=hold-e2e-1/);
  });

  test("provider signup lands on /signup?type=provider", async ({ page }) => {
    await page.goto("/provider/signup");
    await expect(page).toHaveURL(/\/signup\?type=provider/);
    await expect(page.getByText(/switch to customer/i)).toBeVisible({ timeout: 15_000 });
  });

  test("logout returns ok", async ({ request }) => {
    const res = await request.post("/api/auth/sign-out", { failOnStatusCode: false });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
