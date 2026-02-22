#!/usr/bin/env node
/**
 * Production readiness checks (non-destructive).
 * Run from repo root. Works without Turbo; runs per-app typecheck and lint.
 * Optionally checks public config endpoints and heuristics for provider route guards.
 *
 * Usage:
 *   node scripts/prod/readiness-check.mjs
 *   node scripts/prod/readiness-check.mjs --skip-runtime
 *   node scripts/prod/readiness-check.mjs --apps web
 */

import { spawn } from "child_process";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const normalize = (p) => p.replace(ROOT + "\\", "").replace(ROOT + "/", "");

const args = process.argv.slice(2);
const skipRuntime = args.includes("--skip-runtime");
const appsFilter = args.includes("--apps") ? args[args.indexOf("--apps") + 1]?.split(",") : null;
const apps = appsFilter || ["web", "customer", "provider"];

const isWindows = process.platform === "win32";
function run(cwd, command, cmdArgs = []) {
  return new Promise((resolve, reject) => {
    const opts = { cwd, stdio: "pipe", windowsHide: true };
    if (isWindows) opts.shell = true;
    const child = spawn(command, cmdArgs, opts);
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => { out += d; });
    child.stderr?.on("data", (d) => { err += d; });
    child.on("close", (code) => {
      resolve({ code, out, err });
    });
    child.on("error", reject);
  });
}

function heuristicProviderRoutesMissingGuard() {
  const providerApiPath = join(ROOT, "apps", "web", "src", "app", "api", "provider");
  const results = [];
  try {
    const walk = (dir) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name === "route.ts") {
          const content = readFileSync(full, "utf8");
          const hasRequireRole = /requireRoleInApi|requireRole\s*\(/.test(content);
          const hasGetProviderId = /getProviderIdForUser/.test(content);
          const hasProviderByUserId = /\.from\s*\(\s*["']providers["']\s*\)[\s\S]*?user_id[\s\S]*?user\.id/.test(content);
          if (hasRequireRole && !hasGetProviderId && !hasProviderByUserId && !content.includes("superadmin-only")) {
            results.push(normalize(full));
          }
        }
      }
    };
    walk(providerApiPath);
  } catch (e) {
    results.push("(scan failed: " + e.message + ")");
  }
  return results;
}

async function main() {
  const report = [];
  let failed = false;

  for (const app of apps) {
    const pkgPath = join(ROOT, "apps", app, "package.json");
    if (!existsSync(pkgPath)) {
      report.push({ app, typecheck: "skip", lint: "skip", reason: "no package.json" });
      continue;
    }
    const cwd = join(ROOT, "apps", app);

    const tc = await run(cwd, "pnpm", ["run", "typecheck"]);
    const typecheckOk = tc.code === 0;
    if (!typecheckOk) failed = true;
    report.push({ app, typecheck: typecheckOk ? "ok" : "fail", typecheckOut: tc.code !== 0 ? tc.err || tc.out : null });

    const lint = await run(cwd, "pnpm", ["run", "lint"]);
    const lintOk = lint.code === 0;
    if (!lintOk) failed = true;
    report.push({ app, lint: lintOk ? "ok" : "fail", lintOut: lint.code !== 0 ? lint.err || lint.out : null });
  }

  let runtimeOk = true;
  if (!skipRuntime && apps.includes("web")) {
    const baseUrl = process.env.READINESS_BASE_URL || "http://localhost:3000";
    const routes = [
      "/api/public/analytics-config?environment=production",
      "/api/public/third-party-config",
      "/api/public/settings/branding",
    ];
    const forbidden = ["secret_key", "webhook_secret", "api_key_server", "rest_api_key", "client_secret"];
    for (const route of routes) {
      try {
        const res = await fetch(baseUrl + route);
        const text = await res.text();
        const lower = text.toLowerCase();
        const leak = forbidden.find((k) => lower.includes(k.toLowerCase()));
        if (leak) {
          report.push({ check: "runtime", route, status: "fail", reason: "forbidden key in response: " + leak });
          runtimeOk = false;
        } else {
          report.push({ check: "runtime", route, status: res.ok ? "ok" : "warn", code: res.status });
        }
      } catch (e) {
        report.push({ check: "runtime", route, status: "skip", reason: e.message });
      }
    }
  }

  const providerMissingGuard = apps.includes("web") ? heuristicProviderRoutesMissingGuard() : [];
  if (providerMissingGuard.length > 0) {
    report.push({ check: "provider-guard", status: "warn", routes: providerMissingGuard });
  }

  console.log(JSON.stringify({ report, failed, providerRoutesMissingGuard: providerMissingGuard }, null, 2));

  if (failed) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
