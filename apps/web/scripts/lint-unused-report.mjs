#!/usr/bin/env node
/**
 * Report remaining no-unused-vars (params/vars that need _ prefix or removal).
 * Run after "pnpm run lint -- --fix" to see what's left.
 * Usage: node scripts/lint-unused-report.mjs
 * Or: pnpm run lint:unused-report (from apps/web)
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
const byFile = {};
for (const file of json) {
  if (!file.messages?.length) continue;
  for (const msg of file.messages) {
    if (msg.ruleId !== "unused-imports/no-unused-vars") continue;
    const key = msg.ruleId;
    byRule[key] = (byRule[key] || 0) + 1;
    const shortPath = path.relative(root, file.filePath);
    byFile[shortPath] = byFile[shortPath] || [];
    const name = (msg.message.match(/'([^']+)'/) || [])[1] || msg.message;
    byFile[shortPath].push({ line: msg.line, column: msg.column, name, message: msg.message });
  }
}

const total = Object.values(byRule).reduce((a, b) => a + b, 0);
console.log("Remaining unused-vars (prefix with _ or remove):", total);
console.log("");

const files = Object.keys(byFile).sort();
for (const file of files) {
  const items = byFile[file];
  console.log(file);
  for (const { line, name, message } of items) {
    console.log(`  ${line}: ${name}  (${message.split(".")[0]})`);
  }
  console.log("");
}
