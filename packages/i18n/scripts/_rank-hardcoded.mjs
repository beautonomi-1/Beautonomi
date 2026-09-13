#!/usr/bin/env node
/**
 * Temporary ranking of hardcoded-string heuristic matches.
 * Reuses scan-hardcoded.mjs SCAN_ROOTS, IGNORE, PATTERNS, isLikelyCode.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

const SCAN_ROOTS = [
  "apps/customer/app",
  "apps/customer/src",
  "apps/provider/app",
  "apps/provider/src",
  "apps/web/src/app/book",
  "apps/web/src/app/booking",
  "apps/web/src/app/account-settings",
  "apps/web/src/app/provider",
  "apps/web/src/components",
].map((p) => path.join(root, p));

const EXT = new Set([".tsx", ".ts", ".jsx", ".js"]);
const IGNORE = /node_modules|__tests__|\.test\.|\.spec\.|mockups[/\\]/;

const PATTERNS = [
  />\s*[A-Za-z][^<{]{2,80}\s*</g,
  /Alert\.alert\s*\(\s*["'`][^"'`]{3,}/g,
  /placeholder=["'][^"']{3,}["']/g,
  /title=["'][^"']{3,}["']/g,
];

function isLikelyCode(snippet) {
  const inner = snippet.replace(/^>\s*/, "").replace(/\s*<$/, "").trim();
  if (!inner) return true;
  if (/^(router|api|Promise|prev|e)\b/.test(inner)) return true;
  if (/^set[A-Z]/.test(inner)) return true;
  if (/^(toggle|toggleNested|removeMethod|savingKey)\b/.test(inner)) return true;
  if (/:\s*(string|void|number|boolean|Record)\b/.test(inner)) return true;
  if (/^void\b/.test(inner)) return true;
  if (/[=!]=/.test(inner)) return true;
  if (/&&\s*\(/.test(inner)) return true;
  if (/navigateTo|dismissCompletion|normalizeAttachment|isExploreVideoUrl|normalizePublicMembershipPlan/.test(inner)) return true;
  if (/^(nav|pushWeb)\w*\s*\(/.test(inner)) return true;
  if (/Record</.test(inner)) return true;
  if (/\?\s*\(/.test(inner)) return true;
  if (/=>/.test(inner)) return true;
  if (/\)\s*[{;]/.test(inner)) return true;
  if (/\}\s*\)/.test(inner)) return true;
  if (/\.\w+\(/.test(inner)) return true;
  // Brand-only product name (not a sentence of user copy)
  if (/^Beautonomi$/i.test(inner)) return true;
  // JSX handler/expression leftovers: `onClose(null)} >`, `true} >`
  if (snippet.trimStart().startsWith(">") && /\}/.test(inner)) return true;
  // TS generic leftovers after stripping trailing `<`: `withSessionRecovery`, `baseApi.get`
  if (/^with[A-Z][A-Za-z0-9]*$/.test(inner)) return true;
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(inner)) return true;
  // TS signature leftovers: `string, ): Promise`
  if (/\):\s*Promise\b/.test(inner)) return true;
  if (/\breturn\s*\(/.test(inner)) return true;
  if (/\|\|/.test(inner)) return true;
  if (/\|\s*Promise\b/.test(inner)) return true;
  return false;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (IGNORE.test(full)) continue;
    if (ent.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(ent.name))) out.push(full);
  }
  return out;
}

function appBucket(rel) {
  const n = rel.replace(/\\/g, "/");
  if (n.startsWith("apps/customer/")) return "customer";
  if (n.startsWith("apps/provider/")) return "provider";
  if (n.startsWith("apps/web/")) return "web";
  return "other";
}

const matches = [];
for (const scanRoot of SCAN_ROOTS) {
  for (const file of walk(scanRoot)) {
    const text = fs.readFileSync(file, "utf8");
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const snippet = m[0].replace(/\s+/g, " ").slice(0, 120);
        if (/^\s*>\s*[{}]\s*</.test(m[0])) continue;
        if (isLikelyCode(snippet)) continue;
        matches.push({ file: path.relative(root, file).replace(/\\/g, "/"), snippet });
      }
    }
  }
}

const byApp = {};
const byFile = {};
for (const m of matches) {
  const app = appBucket(m.file);
  byApp[app] = (byApp[app] || 0) + 1;
  byFile[m.file] = (byFile[m.file] || 0) + 1;
}

const allFiles = Object.entries(byFile)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const ge3 = allFiles.filter(([, c]) => c >= 3);

console.log(JSON.stringify({
  TOTAL: matches.length,
  BY_APP: byApp,
  FILE_COUNT: allFiles.length,
  GE3_COUNT: ge3.length,
  ALL_FILES: allFiles.map(([file, count]) => ({ count, file })),
}, null, 2));
