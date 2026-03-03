#!/usr/bin/env node
/**
 * Apply all automated lint fixes and optionally suggestion-based fixes.
 *
 * Phase 1: Run eslint . --fix in a loop until no new fixable issues (max 3 passes).
 *          Fixes: unused-imports, prefer-const, no-var, react/no-unescaped-entities, etc.
 *
 * Phase 2 (optional): Apply ESLint "suggestions" that include a fix (e.g. no-explicit-any
 *          suggestUnknown). Use --apply-suggestions to enable. Then runs typecheck;
 *          if typecheck fails, run scripts/revert-unknown-to-any.mjs to undo.
 *
 * Phase 3: Report remaining warnings by rule.
 *
 * Usage:
 *   node scripts/lint-fix-everything.mjs              # safe fixes only
 *   node scripts/lint-fix-everything.mjs --apply-suggestions   # also apply any->unknown (then typecheck)
 *   node scripts/lint-fix-everything.mjs --skip-typecheck      # don't run typecheck at end
 */
import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const applySuggestions = args.includes("--apply-suggestions");
const skipTypecheck = args.includes("--skip-typecheck");

function run(cmd, opts = {}) {
  const parts = cmd.trim().split(/\s+/);
  const [exe, ...exeArgs] = parts;
  const result = spawnSync(exe, exeArgs, {
    cwd: root,
    shell: true,
    encoding: "utf-8",
    ...opts,
  });
  return result;
}

function getLintJson() {
  let out;
  try {
    out = execSync("pnpm exec eslint . --format json", {
      cwd: root,
      encoding: "utf-8",
      maxBuffer: 25 * 1024 * 1024,
    });
  } catch (e) {
    out = e.stdout || "[]";
  }
  return JSON.parse(out);
}

function countByRule(json) {
  const byRule = {};
  let total = 0;
  let fixable = 0;
  for (const file of json) {
    if (!file.messages?.length) continue;
    for (const msg of file.messages) {
      const rule = msg.ruleId || "unknown";
      byRule[rule] = (byRule[rule] || 0) + 1;
      total++;
      if (msg.fix) fixable++;
    }
  }
  return { byRule, total, fixable };
}

function applySuggestionFixes(json) {
  const fileFixes = new Map();
  const fileMessages = new Map();
  for (const file of json) {
    if (!file.messages?.length) continue;
    const filePath = file.filePath;
    const relativePath = path.relative(root, filePath);
    if (!relativePath.startsWith("src") || relativePath.includes("node_modules")) continue;
    const fixes = [];
    for (const msg of file.messages) {
      const suggestion = msg.suggestions?.[0];
      if (!suggestion?.fix?.range) continue;
      const [start, end] = suggestion.fix.range;
      const text = suggestion.fix.text;
      fixes.push({ start, end, text });
    }
    if (fixes.length === 0) continue;
    fileMessages.set(filePath, fixes);
  }
  for (const [filePath, fixes] of fileMessages) {
    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    fixes.sort((a, b) => b.start - a.start);
    for (const { start, end, text } of fixes) {
      content = content.slice(0, start) + text + content.slice(end);
    }
    fileFixes.set(filePath, content);
  }
  return fileFixes;
}

function writeFixes(fileFixes) {
  for (const [filePath, content] of fileFixes) {
    fs.writeFileSync(filePath, content, "utf8");
  }
}

console.log("=== Lint fix everything ===\n");

let jsonBefore = getLintJson();
const before = countByRule(jsonBefore);
console.log("Before: ", before.total, " issues (", before.fixable, " fixable)\n");

console.log("Phase 1: eslint . --fix (up to 3 passes)...\n");
for (let pass = 1; pass <= 3; pass++) {
  const result = run("pnpm exec eslint . --fix", { maxBuffer: 25 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout.slice(-2000));
  const json = getLintJson();
  const { fixable } = countByRule(json);
  if (fixable === 0) {
    console.log("Pass ", pass, ": no fixable issues left.\n");
    break;
  }
  console.log("Pass ", pass, ": applied fixes (", fixable, " fixable remaining).\n");
}

let jsonAfterFix = getLintJson();
const afterFix = countByRule(jsonAfterFix);
console.log("After Phase 1: ", afterFix.total, " issues remaining.\n");

if (applySuggestions) {
  console.log("Phase 2: Applying suggestion fixes (e.g. any -> unknown)...\n");
  const fileFixes = applySuggestionFixes(jsonAfterFix);
  console.log("Applying fixes in ", fileFixes.size, " files.\n");
  writeFixes(fileFixes);
  jsonAfterFix = getLintJson();
  const afterSuggestions = countByRule(jsonAfterFix);
  console.log("After Phase 2: ", afterSuggestions.total, " issues remaining.\n");

  if (!skipTypecheck) {
    console.log("Running typecheck after suggestion fixes...\n");
    const tc = run("pnpm typecheck");
    if (tc.stdout) process.stdout.write(tc.stdout);
    if (tc.stderr) process.stderr.write(tc.stderr);
    if (tc.status !== 0) {
      console.error("\nTypecheck failed after applying suggestion fixes (e.g. any->unknown).");
      console.error("To revert: node scripts/revert-unknown-to-any.mjs\n");
      process.exit(1);
    }
    console.log("Typecheck passed.\n");
  }
}

if (!skipTypecheck && !applySuggestions) {
  console.log("Running typecheck...\n");
  const tc = run("pnpm typecheck");
  if (tc.status !== 0 && tc.stdout) process.stdout.write(tc.stdout);
  if (tc.stderr) process.stderr.write(tc.stderr);
  if (tc.status !== 0) {
    console.error("\nTypecheck failed.");
    process.exit(1);
  }
  console.log("Typecheck passed.\n");
}

console.log("=== Remaining issues by rule ===\n");
const { byRule, total } = countByRule(jsonAfterFix);
const sorted = Object.entries(byRule).sort((a, b) => b[1] - a[1]);
for (const [rule, count] of sorted) {
  console.log(String(count).padStart(6), rule);
}
console.log("\nTotal: ", total, " (0 errors = lint exit 0)\n");
console.log("Done.\n");
