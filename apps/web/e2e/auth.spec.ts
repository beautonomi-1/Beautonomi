import { test, expect, type Page } from "@playwright/test";
import { dismissCookieBannerIfVisible, seedCookieConsent } from "./_consent";

/**
 * Part H — Login and signup journeys.
 *
 * Password login is mocked at /api/auth/sign-in so preview/CI does not need
 * a real Supabase password user. Session is omitted so the client skips
 * setSession JWT validation. Post-login navigation targets public `/booking`
 * (protected routes like `/bookings` require real Supabase cookies).
 */

const HOLD_NEXT = "/booking?slug=e2e-salon&hold_id=hold-e2e-1&step=pay";

const gotoOptions = {
  waitUntil: "domcontentloaded" as const,
  timeout: 180_000,
};

async function stubPublicAuthConfig(page: Page) {
  await page.route("**/api/public/config-bundle**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        auth: {
          // Email-only avoids flaky phone/email tab clicks in slow local dev.
          phone_provider_enabled: false,
          email_provider_enabled: true,
        },
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await stubPublicAuthConfig(page);
  await seedCookieConsent(page);
});

async function mockPasswordSignIn(page: Page, role = "customer") {
  await page.route(/\/api\/me(\/.*)?(\?.*)?$/, async (route) => {
    const url = route.request().url();
    if (url.includes("/role")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { role } }),
      });
      return;
    }
    if (url.includes("/onboarding/complete")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { completed: true } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { id: "e2e-user", email: "e2e@example.com", role },
      }),
    });
  });

  await page.route("**/api/auth/sign-in", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
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
}

async function waitForLoginShell(page: Page) {
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible({
    timeout: 180_000,
  });
  await page
    .waitForResponse(
      (res) => res.url().includes("/api/public/config-bundle") && res.status() === 200,
      { timeout: 180_000 },
    )
    .catch(() => {});
}

async function switchToPasswordLogin(page: Page) {
  await waitForLoginShell(page);
  await dismissCookieBannerIfVisible(page);

  if (await page.locator("#login-email").isVisible().catch(() => false)) {
    await expect(page.locator("#login-password")).toBeVisible();
    return;
  }

  const emailTab = page
    .getByTestId("login-tab-email")
    .or(page.getByRole("tab", { name: /^email$/i }));
  if (await emailTab.isVisible().catch(() => false)) {
    await emailTab.click({ force: true });
  }

  const usePassword = page
    .getByTestId("login-use-password")
    .or(page.getByRole("button", { name: /use password instead/i }));
  await expect(usePassword).toBeVisible({ timeout: 90_000 });
  await usePassword.click();
  await expect(page.locator("#login-email")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#login-password")).toBeVisible();
}

async function expectPathname(page: Page, pattern: RegExp, timeoutMs = 120_000) {
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: timeoutMs })
    .toMatch(pattern);
}

async function submitPasswordLogin(page: Page, email: string, password: string) {
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  const signInResponse = page.waitForResponse(
    (res) =>
      res.url().includes("/api/auth/sign-in") &&
      res.request().method() === "POST" &&
      res.status() === 200,
    { timeout: 180_000 },
  );
  const loginButton = page
    .getByTestId("login-submit")
    .or(page.getByRole("button", { name: /^log in$/i }));
  await expect(loginButton).toBeEnabled({ timeout: 60_000 });
  await loginButton.click();
  await signInResponse;
  await page.waitForURL(/\/booking/, { timeout: 120_000 }).catch(() => {});
}

async function gotoLogin(page: Page, next = HOLD_NEXT) {
  const configLoaded = page.waitForResponse(
    (res) => res.url().includes("/api/public/config-bundle") && res.status() === 200,
    { timeout: 180_000 },
  );
  await page.goto(`/login?next=${encodeURIComponent(next)}`, gotoOptions);
  await configLoaded.catch(() => {});
}

test.describe("auth journeys", () => {
  test.setTimeout(240_000);

  test.beforeAll(async ({ request }) => {
    await request.get("/login", { timeout: 120_000, failOnStatusCode: false });
    // Warm the auth API route so the first password-login test is not blocked on Turbopack compile.
    await request.post("/api/auth/sign-in", {
      timeout: 120_000,
      failOnStatusCode: false,
      data: { email: "warm@example.com", password: "warm" },
    });
  });

  test("password login happy path (mocked)", async ({ page }) => {
    await mockPasswordSignIn(page);
    await gotoLogin(page);
    await switchToPasswordLogin(page);
    await submitPasswordLogin(page, "e2e@example.com", "password123");
    await expectPathname(page, /^\/booking$/);
    expect(page.url()).toMatch(/slug=e2e-salon/);
  });

  test("forgot / reset navigation preserves next", async ({ page }) => {
    await gotoLogin(page);
    await switchToPasswordLogin(page);
    const forgotLink = page.getByRole("link", { name: /forgot password/i });
    const forgotHref = await forgotLink.getAttribute("href");
    expect(forgotHref).toMatch(/^\/forgot-password/);
    await page.goto(forgotHref!, gotoOptions);
    await expectPathname(page, /^\/forgot-password$/, 60_000);
    expect(decodeURIComponent(page.url())).toContain("/booking");
    expect(page.url()).toMatch(/hold_id/);
    await expect(page.locator("#forgot-heading")).toBeVisible({ timeout: 60_000 });
  });

  test("booking return banner on login with next=/booking", async ({ page }) => {
    const next = "/booking?slug=e2e-salon&step=time&auth_return=1";
    await gotoLogin(page, next);
    await waitForLoginShell(page);
    await expect(page.getByRole("status")).toContainText(/finish your booking/i);
    await expect(page.getByLabel("Continue booking").first()).toHaveAttribute("href", next);
  });

  test("gate-to-booking next param survives login", async ({ page }) => {
    await mockPasswordSignIn(page);
    await gotoLogin(page);
    await expect(page).toHaveURL(/next=/);
    expect(decodeURIComponent(page.url())).toContain("/booking");
    await switchToPasswordLogin(page);
    await submitPasswordLogin(page, "e2e@example.com", "password123");
    await expectPathname(page, /^\/booking$/);
    expect(page.url()).toMatch(/hold_id=hold-e2e-1/);
  });

  test("provider signup lands on /signup?type=provider", async ({ page }) => {
    await page.goto("/signup?type=provider", gotoOptions);
    await expect(page).toHaveURL(/\/signup\?type=provider/, { timeout: 60_000 });
    await expect(
      page.getByRole("heading", { name: /sign up as a beauty provider/i }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /switch to customer/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("logout returns ok", async ({ request }) => {
    const res = await request.post("/api/auth/sign-out", {
      failOnStatusCode: false,
      timeout: 120_000,
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
