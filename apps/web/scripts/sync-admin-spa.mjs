#!/usr/bin/env node
/**
 * Copy Vite admin SPA output into Next public tree so `/admin/*` can be served as static files.
 * Invoked from `next-build.mjs` before `next build`.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
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
  console.warn(
    "[admin-spa] apps/admin-web/dist not found — run `pnpm exec turbo run build --filter=admin-web` first. Web build continues (legacy /admin only)."
  );
  process.exit(0);
}

mkdirSync(join(root, "public"), { recursive: true });
rmSync(target, { recursive: true, force: true });
cpSync(adminDist, target, { recursive: true });
console.log("[admin-spa] synced apps/admin-web/dist → apps/web/public/admin");
