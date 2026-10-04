import type { Page } from "@playwright/test";

export const CONSENT_STORAGE_KEY = "beautonomi_cookie_consent_v1";

/** Pre-seed consent so the fixed banner does not intercept booking/login clicks. */
export async function seedCookieConsent(page: Page) {
  await page.addInitScript((storageKey) => {
    const record = {
      schemaVersion: 1,
      policyVersion: "2026-04-07.1",
      updatedAt: new Date().toISOString(),
      categories: {
        necessary: true,
        analytics: true,
        functional: true,
        marketing: true,
      },
    };
    window.localStorage.setItem(storageKey, JSON.stringify(record));
  }, CONSENT_STORAGE_KEY);
}

export async function dismissCookieBannerIfVisible(page: Page) {
  const accept = page.getByRole("button", { name: /accept all/i });
  if (await accept.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await accept.click();
  }
}
