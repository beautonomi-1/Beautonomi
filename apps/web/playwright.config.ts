import { defineConfig, devices } from "@playwright/test";

/**
 * F16 — Playwright config for booking happy-path E2E.
 *
 * In CI we run against the Preview deployment URL published by Vercel.
 * Locally, override `PLAYWRIGHT_BASE_URL=http://localhost:3000`.
 */
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.VERCEL_PREVIEW_URL ??
  "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
