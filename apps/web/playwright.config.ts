import { defineConfig, devices } from "@playwright/test";
import { vercelProtectionBypassHeaders } from "./e2e/_bypass";

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

const isLocalBase =
  baseURL.includes("localhost") || baseURL.includes("127.0.0.1");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: !isLocalBase,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI || isLocalBase ? 1 : undefined,
  timeout: isLocalBase ? 240_000 : 30_000,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    navigationTimeout: isLocalBase ? 180_000 : 30_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    extraHTTPHeaders: vercelProtectionBypassHeaders(),
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
