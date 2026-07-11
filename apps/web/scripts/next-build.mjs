#!/usr/bin/env node
/**
 * Default production build entry. Turbopack keeps peak memory lower on this large app;
 * set NEXT_WEB_FORCE_WEBPACK=1 when debugging a webpack-only production issue.
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

const syncNativeVersions = spawnSync(process.execPath, [join(root, "scripts", "sync-native-app-versions.mjs")], {
  cwd: root,
  stdio: "inherit",
});
if (syncNativeVersions.status !== 0 && syncNativeVersions.status !== null) {
  process.exit(syncNativeVersions.status);
}

const syncAdmin = spawnSync(process.execPath, [join(root, "scripts", "sync-admin-spa.mjs")], {
  cwd: root,
  stdio: "inherit",
});
if (syncAdmin.status !== 0 && syncAdmin.status !== null) {
  process.exit(syncAdmin.status);
}

const isProdOrPreview =
  process.env.VERCEL_ENV === "production" ||
  process.env.VERCEL_ENV === "preview" ||
  process.env.NODE_ENV === "production";

if (isProdOrPreview) {
  console.log("[security-env] Running production security environment gate…");
  const securityCheck = spawnSync(
    process.execPath,
    [join(root, "scripts", "check-security-env.mjs")],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  if (securityCheck.status !== 0 && securityCheck.status !== null) {
    process.exit(securityCheck.status);
  }
}

// Use Turbopack by default — webpack `next build` can exceed 8GB heap on this app.
// Override: NEXT_WEB_FORCE_WEBPACK=1 to force webpack when debugging a Turbopack-only issue.
const useTurbopack = process.env.NEXT_WEB_FORCE_WEBPACK !== "1";
const modeArgs = useTurbopack ? ["--turbopack"] : ["--webpack"];
const nodeOpts =
  process.env.NODE_OPTIONS || "--max-old-space-size=8192";

const result = spawnSync(process.execPath, [nextCli, "build", ...modeArgs], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: nodeOpts },
});

process.exit(result.status ?? 1);
