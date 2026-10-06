#!/usr/bin/env node
/**
 * EAS build preflight (repo + local CLI). Does not start cloud builds.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function run(cmd, args, cwd = ROOT) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  return { code: r.status ?? 1, out: (r.stdout || "") + (r.stderr || "") };
}

const checks = [];

for (const app of ["customer", "provider"]) {
  const easPath = path.join(ROOT, "apps", app, "eas.json");
  if (!fs.existsSync(easPath)) {
    console.error(`Missing ${easPath}`);
    process.exit(1);
  }
  const r = run("pnpm", ["--filter", app, "exec", "expo", "config", "--type", "public"], ROOT);
  checks.push({ name: `${app} expo config`, ok: r.code === 0, detail: r.code === 0 ? "OK" : r.out.slice(-300) });
}

const whoami = run("pnpm", ["--dir", "apps/customer", "exec", "eas", "whoami"], ROOT);
checks.push({
  name: "eas whoami (customer app context)",
  ok: whoami.code === 0,
  detail: whoami.code === 0 ? whoami.out.trim() : "Run `eas login` on submit machine. " + whoami.out.slice(-200),
});

console.log("=== EAS build preflight ===\n");
let failed = 0;
for (const c of checks) {
  console.log(c.ok ? "PASS" : "WARN/FAIL", c.name, "-", c.detail);
  if (!c.ok) failed++;
}
const providerAndroid = path.join(ROOT, "apps", "provider", "android");
if (fs.existsSync(providerAndroid)) {
  console.log(
    "\nWARN: apps/provider/android exists — EAS may treat provider as bare workflow and Android builds can fail.",
  );
  console.log("       Rename/stash android/ before `eas build --platform android`, or rely on .easignore + empty archive.");
}

console.log("\nDocs: docs/DEPLOYMENT_EAS.md, docs/mobile/PUSH_NOTIFICATIONS_CHECKLIST.md");
console.log("Build: pnpm run build:customer:ios | build:customer:android | build:provider:ios | build:provider:android");
process.exit(failed > 0 ? 1 : 0);
