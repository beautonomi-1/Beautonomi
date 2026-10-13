#!/usr/bin/env node
/** Apply phrase-level FR/AR patches then register curated entries. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const steps = [
  "patch-mobile-gate-translations.mjs",
  "fill-mobile-leftovers-from-sibling-keys.mjs",
  "register-mobile-leftover-curated.mjs",
];

for (const s of steps) {
  const r = spawnSync(process.execPath, [path.join("scripts", s)], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
