/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pick(
  merged: Record<string, string>,
  viteKey: string,
  nextKey: string
): string {
  return (
    merged[viteKey] ||
    merged[nextKey] ||
    process.env[viteKey] ||
    process.env[nextKey] ||
    ""
  );
}

/**
 * Inject merged public env so the SPA matches Next.js `NEXT_PUBLIC_*` when `VITE_*` is unset.
 * Loads `.env*` from both `apps/web` and `apps/admin-web` (admin overrides web on key clashes).
 */
function buildAdminImportMetaDefine(mode: string): Record<string, string> {
  const webRoot = path.resolve(__dirname, "../web");
  const adminRoot = __dirname;
  const merged: Record<string, string> = {
    ...loadEnv(mode, webRoot, ""),
    ...loadEnv(mode, adminRoot, ""),
  };

  const entries: Record<string, string> = {
    VITE_SUPABASE_URL: pick(merged, "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    VITE_SUPABASE_ANON_KEY: pick(merged, "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    VITE_APP_URL: pick(merged, "VITE_APP_URL", "NEXT_PUBLIC_APP_URL"),
    VITE_SITE_URL: pick(merged, "VITE_SITE_URL", "NEXT_PUBLIC_SITE_URL"),
    VITE_SENTRY_DSN: pick(merged, "VITE_SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"),
    VITE_SENTRY_ENVIRONMENT:
      merged.VITE_SENTRY_ENVIRONMENT || process.env.VITE_SENTRY_ENVIRONMENT || "",
    VITE_GOOGLE_ANALYTICS_ID: pick(merged, "VITE_GOOGLE_ANALYTICS_ID", "NEXT_PUBLIC_GOOGLE_ANALYTICS_ID"),
    VITE_AMPLITUDE_API_KEY: pick(merged, "VITE_AMPLITUDE_API_KEY", "NEXT_PUBLIC_AMPLITUDE_API_KEY"),
    VITE_MAPBOX_ACCESS_TOKEN: pick(merged, "VITE_MAPBOX_ACCESS_TOKEN", "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"),
    VITE_GLOBAL_ENTRY_HOST: pick(merged, "VITE_GLOBAL_ENTRY_HOST", "NEXT_PUBLIC_GLOBAL_ENTRY_HOST"),
    VITE_DEFAULT_MARKET_HOST: pick(merged, "VITE_DEFAULT_MARKET_HOST", "NEXT_PUBLIC_DEFAULT_MARKET_HOST"),
    VITE_MARKET_OVERRIDE_TTL_HOURS: pick(
      merged,
      "VITE_MARKET_OVERRIDE_TTL_HOURS",
      "NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS"
    ),
    VITE_CATEGORY_ICON_CACHE_REVISION: pick(
      merged,
      "VITE_CATEGORY_ICON_CACHE_REVISION",
      "NEXT_PUBLIC_CATEGORY_ICON_CACHE_REVISION"
    ),
  };

  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])
  ) as Record<string, string>;
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: buildAdminImportMetaDefine(mode),
  base: "/admin/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/auth": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("lucide-react")) return "lucide";
          if (id.includes("@tanstack/react-query")) return "tanstack-query";
          if (id.includes("react-dom")) return "react-dom";
          if (id.includes("react-router")) return "react-router";
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
