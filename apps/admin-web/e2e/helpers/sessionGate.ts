import { expect, type Page } from "@playwright/test";

export const SESSION_GATE = /Verifying session|could not verify your admin session|Admin sign in/i;

/** Wait for React to mount before asserting session gate (avoids empty-body flakes on lazy routes). */
export async function expectAdminSessionGate(page: Page) {
  await expect(page.locator("#root")).not.toBeEmpty({ timeout: 20_000 });
  await expect(page.locator("body")).toContainText(SESSION_GATE, { timeout: 20_000 });
  await expect(page.locator("body")).not.toContainText(/404|page not found/i);
}
