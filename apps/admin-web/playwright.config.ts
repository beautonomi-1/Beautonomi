import { defineConfig, devices } from "@playwright/test";

/**
 * Minimal E2E: static shell against `vite preview` (no backend required for /admin/login).
 * CI: build admin-web first, then `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm exec vite preview --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/admin/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
