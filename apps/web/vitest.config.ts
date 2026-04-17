import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    /**
     * API route tests import heavy modules (Next, Supabase, zod, pdfkit).
     * On constrained or Windows CI runners the first test in a parallel
     * worker frequently needs 10-20s just for the cold module graph — bump
     * the per-test timeout well above the 5s default so we don't ship flaky
     * false-positives in the launch gate. Individual long-running tests can
     * still override this with their own explicit timeout argument.
     */
    testTimeout: 45_000,
    hookTimeout: 45_000,
    /**
     * On Windows the cold module graph for API-route tests (Next, Supabase,
     * pdfkit, zod, etc.) can take 20–30s to boot per worker. Running the
     * default one-worker-per-core schedule saturates I/O and triples real
     * startup cost, producing flaky timeout failures in the release gate.
     * Cap to 4 workers so each still gets enough CPU without starving.
     */
    poolOptions: {
      threads: { maxThreads: 4, minThreads: 1 },
      forks: { maxForks: 4, minForks: 1 },
    },
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,ts,jsx,tsx}"],
    exclude: ["node_modules", ".next"],
    coverage: {
      provider: 'v8',
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.ts",
        "src/**/*.spec.tsx",
        ".next/",
        "coverage/",
      ],
      include: ["src/**/*.{ts,tsx}"],
    },
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
