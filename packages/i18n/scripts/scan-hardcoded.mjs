#!/usr/bin/env node
/**
 * Scans in-scope apps for likely user-visible hardcoded strings (heuristic).
 * Exits non-zero when matches exceed threshold (CI gate — tighten over time).
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

/** JSX text nodes and common alert patterns */
const PATTERNS = [
  />\s*[A-Za-z][^<{]{2,80}\s*</g,
  /Alert\.alert\s*\(\s*["'`][^"'`]{3,}/g,
  /placeholder=["'][^"']{3,}["']/g,
  /title=["'][^"']{3,}["']/g,
];

/** Drop JSX/JS fragments the `>…<` heuristic treats as copy. */
function isLikelyCode(snippet) {
  const inner = snippet.replace(/^>\s*/, "").replace(/\s*<$/, "").trim();
  if (!inner) return true;
  if (/^(router|api|Promise|prev|e)\b/.test(inner)) return true;
  if (/^new Promise\b/.test(inner)) return true;
  if (/^new Date\b/.test(inner)) return true;
  if (/\blistLimit\b/.test(inner)) return true;
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
  if (/ApiResponse/.test(inner)) return true;
  if (/\bunwrap\b/.test(inner)) return true;
  if (/\bfunction\s+\w+\s*\(/.test(inner)) return true;
  if (/^string;/.test(inner)) return true;
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(inner)) return true;
  // TS signature leftovers: `string, ): Promise`
  if (/\):\s*Promise\b/.test(inner)) return true;
  if (/\breturn\s*\(/.test(inner)) return true;
  if (/\|\|/.test(inner)) return true;
  if (/\|\s*Promise\b/.test(inner)) return true;
  // Numeric / URL / time / hex placeholders are not translatable copy
  if (/^placeholder=["'][\d.:-]+["']$/.test(snippet)) return true;
  if (/^placeholder=["']#[0-9A-Fa-f]{3,8}["']$/.test(snippet)) return true;
  if (/^placeholder=["']https?:\/\//.test(snippet)) return true;
  if (/\bfetcher\b/.test(inner)) return true;
  if (/\bexport type\b/.test(inner)) return true;
  if (/\bNumber\s*\(/.test(inner)) return true;
  if (/\bisTodayInTz\b/.test(inner)) return true;
  if (/\bvirtualized\b/.test(inner)) return true;
  if (/\binterface\s+\w+/.test(inner)) return true;
  if (/\*\/\s*(export\s+)?(type|interface)\b/.test(inner)) return true;
  if (/\bthe most compatible\b/.test(inner)) return true;
  if (/\[&>/.test(inner)) return true;
  if (/\[&>/.test(snippet)) return true;
  if (/button\]:hidden/.test(snippet)) return true;
  if (/\*\s+The\b/.test(inner)) return true;
  // JSX/JS identifier leftovers (`date <= startDate`)
  if (/^date$/.test(inner)) return true;
  if (/\bminSwipeDistance\b/.test(inner)) return true;
  if (/\bhandle(Create|Add|Open)/.test(inner)) return true;
  if (/div:last-child/.test(inner)) return true;
  if (/svg\]:/.test(inner)) return true;
  if (/\):\s*Array\b/.test(inner)) return true;
  if (/^placeholder=["'][\d.,]+["']$/.test(snippet)) return true;
  if (/^(USD|EUR|ZAR|GBP|NGN)$/.test(inner)) return true;
  if (/^R[\d,]+$/.test(inner)) return true;
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

const matches = [];
for (const scanRoot of SCAN_ROOTS) {
  for (const file of walk(scanRoot)) {
    const text = fs.readFileSync(file, "utf8");
    if (text.includes("t(") || text.includes("useTranslation")) {
      // still scan — mixed files are common
    }
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const snippet = m[0].replace(/\s+/g, " ").slice(0, 120);
        if (/^\s*>\s*[{}]\s*</.test(m[0])) continue;
        const lineStart = text.lastIndexOf("\n", m.index) + 1;
        const lineEnd = text.indexOf("\n", m.index);
        const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
        if (/^\s*\/\//.test(line) || /\/\*.*\*\/\s*$/.test(line)) continue;
        const before = text.slice(0, m.index);
        const lastJsxOpen = before.lastIndexOf("{/*");
        const lastJsxClose = before.lastIndexOf("*/}");
        if (lastJsxOpen > lastJsxClose) continue;
        if (isLikelyCode(snippet)) continue;
        matches.push({ file: path.relative(root, file), snippet });
      }
    }
  }
}

const outPath = path.join(root, "packages/i18n/keys-pending.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify({ scannedAt: new Date().toISOString(), count: matches.length, sample: matches.slice(0, 200) }, null, 2),
);

console.log(`i18n:scan found ${matches.length} heuristic matches (sample written to keys-pending.json)`);

/** Threshold — leftover matches are comments/code after extraction */
const THRESHOLD = 20;
if (matches.length > THRESHOLD) {
  console.error(`Exceeds threshold ${THRESHOLD}`);
  process.exit(1);
}
