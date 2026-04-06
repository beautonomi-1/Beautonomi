#!/usr/bin/env node
/**
 * Default production build entry: webpack locally (stable with pdfkit / server routes),
 * Turbopack on GitHub Actions only to cut peak RSS on ~7GB runners.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const monorepoRoot = join(root, "..", "..");
const adminDist = join(monorepoRoot, "apps", "admin-web", "dist");
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");

/**
 * Vercel projects often set Root Directory to `apps/web` and run `pnpm build` here only.
 * Turbo's `^build` ordering applies when using `turbo run build --filter=web` from the repo root,
 * but a plain `next build` wrapper does not — so ensure the admin SPA exists on hosted CI.
 */
const shouldEnsureAdminSpa =
  process.env.SKIP_ADMIN_SPA_SYNC !== "1" &&
  !existsSync(adminDist) &&
  (process.env.VERCEL === "1" || process.env.GITHUB_ACTIONS === "true");

if (shouldEnsureAdminSpa) {
  console.log("[admin-spa] dist missing on CI host — running turbo build for admin-web");
  const adminBuild = spawnSync(
    "pnpm",
    ["exec", "turbo", "run", "build", "--filter=admin-web"],
    {
      cwd: monorepoRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    }
  );
  if (adminBuild.status !== 0 && adminBuild.status !== null) {
    process.exit(adminBuild.status);
  }
}

const syncAdmin = spawnSync(process.execPath, [join(root, "scripts", "sync-admin-spa.mjs")], {
  cwd: root,
  stdio: "inherit",
});
if (syncAdmin.status !== 0 && syncAdmin.status !== null) {
  process.exit(syncAdmin.status);
}

// Use Turbopack on memory-constrained CI (GHA) and Vercel — webpack `next build` often exceeds ~6GB heap.
// Override: NEXT_WEB_FORCE_WEBPACK=1 to force webpack when debugging a Turbopack-only issue.
const useTurbopack =
  (process.env.GITHUB_ACTIONS === "true" || process.env.VERCEL === "1") &&
  process.env.NEXT_WEB_FORCE_WEBPACK !== "1";
const modeArgs = useTurbopack ? ["--turbopack"] : ["--webpack"];
const nodeOpts =
  process.env.NODE_OPTIONS || "--max-old-space-size=6144";

const result = spawnSync(process.execPath, [nextCli, "build", ...modeArgs], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: nodeOpts },
});

process.exit(result.status ?? 1);
