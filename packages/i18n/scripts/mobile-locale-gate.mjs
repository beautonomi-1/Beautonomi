#!/usr/bin/env node
/**
 * Completion gate: run leftover-tr-mobile-apps --report and exit non-zero if any in-scope English remains.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "leftover-tr-mobile-apps.mjs");
const r = spawnSync(process.execPath, [script, "--report"], { encoding: "utf8", cwd: path.join(script, "..", "..") });

process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");

const m = (r.stdout || "").match(/Total leftover-English \(in-scope\): (\d+)/);
const total = m ? Number(m[1]) : -1;
if (total !== 0) {
  console.error(`\nmobile-locale-gate: FAIL (${total} leftover-English keys)`);
  process.exit(1);
}
console.log("\nmobile-locale-gate: PASS");
process.exit(r.status ?? 0);
