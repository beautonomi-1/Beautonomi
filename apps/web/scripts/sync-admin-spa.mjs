#!/usr/bin/env node
/**
 * Copy Vite admin SPA output into Next public tree so `/admin/*` can be served as static files.
 * Invoked from `next-build.mjs` before `next build`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const monorepoRoot = join(root, "..", "..");
const adminDist = join(monorepoRoot, "apps", "admin-web", "dist");
const target = join(root, "public", "admin");

if (process.env.SKIP_ADMIN_SPA_SYNC === "1") {
  console.log("[admin-spa] SKIP_ADMIN_SPA_SYNC=1 — skipping sync");
  process.exit(0);
}

if (!existsSync(adminDist)) {
  if ((process.env.ADMIN_SPA_ROUTING || "").toLowerCase() === "spa") {
    console.error(
      "[admin-spa] apps/admin-web/dist not found while ADMIN_SPA_ROUTING=spa — failing build to avoid shipping a missing admin SPA."
    );
    process.exit(1);
  }
  console.warn(
    "[admin-spa] apps/admin-web/dist not found — run `pnpm exec turbo run build --filter=admin-web` first. Web build continues (legacy /admin only)."
  );
  process.exit(0);
}

mkdirSync(join(root, "public"), { recursive: true });
rmSync(target, { recursive: true, force: true });
cpSync(adminDist, target, { recursive: true });

const indexHtmlPath = join(target, "index.html");
if (existsSync(indexHtmlPath)) {
  const indexHtml = readFileSync(indexHtmlPath, "utf8");
  const assetRefs = [
    ...indexHtml.matchAll(/(?:src|href)=["'](?:\/admin\/)?(assets\/[^"']+)["']/g),
  ].map((match) => match[1]);
  const missingAssets = assetRefs.filter((relPath) => !existsSync(join(target, relPath)));
  if (missingAssets.length > 0) {
    console.error(
      "[admin-spa] synced index.html references assets that are missing on disk:\n" +
        missingAssets.map((asset) => `  - ${asset}`).join("\n"),
    );
    process.exit(1);
  }
}

console.log("[admin-spa] synced apps/admin-web/dist → apps/web/public/admin");
