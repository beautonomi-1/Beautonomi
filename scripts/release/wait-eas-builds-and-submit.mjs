#!/usr/bin/env node
/**
 * Poll EAS until listed builds are finished, then run submit:all.
 * Usage: node scripts/release/wait-eas-builds-and-submit.mjs
 */
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { setTimeout as sleep } from "timers/promises";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const doc = readFileSync(
  path.join(ROOT, "docs/go-live/MOBILE_1.0.98_EAS_BUILDS.md"),
  "utf8",
);
const ids = [...doc.matchAll(/`([0-9a-f-]{36})`/g)].map((m) => m[1]);

function listStatus(appDir) {
  const r = spawnSync("pnpm", ["exec", "eas", "build:list", "--limit", "10", "--json", "--non-interactive"], {
    cwd: path.join(ROOT, "apps", appDir),
    encoding: "utf8",
    shell: true,
  });
  if (r.status !== 0) return {};
  try {
    const rows = JSON.parse(r.stdout);
    const map = {};
    for (const row of rows) map[row.id] = row.status;
    return map;
  } catch {
    return {};
  }
}

console.log("Waiting for builds:", ids.join(", "));
for (;;) {
  const status = { ...listStatus("customer"), ...listStatus("provider") };
  const norm = (s) => String(s ?? "").toLowerCase();
  const pending = ids.filter((id) => status[id] && norm(status[id]) !== "finished");
  const failed = ids.filter((id) => {
    const s = norm(status[id]);
    return s === "errored" || s === "canceled" || s === "error";
  });
  const unknown = ids.filter((id) => !status[id]);
  if (failed.length) {
    console.error("Build failed/canceled:", failed.map((id) => `${id}=${status[id]}`).join(", "));
    process.exit(1);
  }
  if (unknown.length === 0 && pending.length === 0) break;
  console.log(
    new Date().toISOString(),
    "unknown:",
    unknown.length,
    "pending:",
    pending.map((id) => `${id.slice(0, 8)}…=${status[id]}`).join(", "),
  );
  await sleep(120_000);
}

console.log("All builds finished. Running submit:all…");
const sub = spawnSync("pnpm", ["run", "submit:all"], { cwd: ROOT, stdio: "inherit", shell: true });
process.exit(sub.status ?? 1);
