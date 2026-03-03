#!/usr/bin/env node
/**
 * Output ESLint warning/error counts by rule (from JSON format).
 * Run: pnpm exec eslint . --format json | node scripts/lint-warnings-by-rule.mjs
 * Or: node scripts/lint-warnings-by-rule.mjs (runs eslint internally)
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

let json;
try {
  const out = execSync("pnpm exec eslint . --format json", {
    cwd: root,
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });
  json = JSON.parse(out);
} catch (e) {
  if (e.stdout) json = JSON.parse(e.stdout);
  else throw e;
}

const byRule = {};
let total = 0;
for (const file of json) {
  if (!file.messages?.length) continue;
  for (const msg of file.messages) {
    const rule = msg.ruleId || "unknown";
    byRule[rule] = (byRule[rule] || 0) + 1;
    total++;
  }
}

const sorted = Object.entries(byRule).sort((a, b) => b[1] - a[1]);
console.log("Lint issues by rule (total:", total, ")\n");
for (const [rule, count] of sorted) {
  console.log(String(count).padStart(6), rule);
}
