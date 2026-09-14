#!/usr/bin/env node
/**
 * Strict provider-web i18n leftover scanner.
 * Roots: apps/web provider portal pages + components.
 * CI gate: threshold 0 after extraction (override with --threshold=N).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

const SCAN_ROOTS = [
  "apps/web/src/app/provider",
  "apps/web/src/components/provider",
  "apps/web/src/components/provider-portal",
].map((p) => path.join(root, p));

const EXT = new Set([".tsx", ".ts"]);
const IGNORE = /node_modules|__tests__|\.test\.|\.spec\.|mockups[/\\]/;

const SKIP_EXACT = new Set([
  "OK", "ID", "SKU", "VAT", "EFT", "PIN", "QR", "CSV", "PDF", "SMS", "URL", "UTC",
  "ZA", "Yoco", "Paystack", "PayCloud", "Capitec", "Beautonomi",
  "USD", "EUR", "ZAR", "GBP", "NGN", "PROD", "REC",
]);

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

function skipLiteral(s) {
  const t = s.trim();
  if (t.length < 2) return true;
  if (SKIP_EXACT.has(t)) return true;
  if (/^web\.|^provider\.|^common\.|^auth\./.test(t)) return true;
  if (/^(https?:|www\.|\/[a-z]|mailto:)/i.test(t)) return true;
  if (/^[a-zA-Z_$][\w$]*$/.test(t) && t.length < 40 && !/\s/.test(t)) return true;
  if (/^(yyyy|yyyy-MM|MM|dd|HH|mm|ss|EEE|MMMM|PPP|p|P|LLL)/.test(t)) return true;
  if (/[#.]/.test(t) && !/\s/.test(t)) return true;
  if (/^(flex|grid|hidden|block|inline|absolute|relative|sticky|cursor|transition|duration|rounded|shadow|w-|h-|min-|max-|p-|m-|gap-|space-|items-|justify-|overflow-|z-|opacity-|font-|leading-|tracking-|bg-|text-|border-|hover:|focus:|sm:|md:|lg:|xl:|2xl:|mt-|mb-|ms-|me-|px-|py-|divide-)/.test(t)) return true;
  if (t.includes("className") || /\b(px-|py-|mt-|mb-|ms-|me-|p-\d)/.test(t)) return true;
  if (/^#[0-9A-Fa-f]{3,8}$/.test(t)) return true;
  if (/^\d/.test(t) && t.length < 12) return true;
  if (/^placeholder=["'][\d.:-]+["']$/.test(t)) return true;
  if (/^Beautonomi$/i.test(t)) return true;
  // TypeScript / JSX expression fragments (not user copy)
  if (/\)\s*=>\s*Promise\b/.test(t)) return true;
  if (/string\):\s*(Record|Array|Promise)\b/.test(t)) return true;
  if (/Record\s*<|Array\s*</.test(t)) return true;
  if (/[=!<>]+\s*\d/.test(t) && !/[A-Za-z]{4,}/.test(t)) return true;
  if (/&&\s*\w/.test(t) && !/\s(?:the|and|for|with|your|please)\s/i.test(t)) return true;
  if (/\|\|\s*\w/.test(t)) return true;
  if (/\.(length|trim|startsWith|includes|match)\(/.test(t)) return true;
  if (/as\s+Record\b/.test(t)) return true;
  if (/action_type\?:\s*string/.test(t)) return true;
  if (/Number\(|undefined\s*\|\|/.test(t)) return true;
  if (/\.replace\(/.test(t)) return true;
  if (/^Generated:/.test(t)) return true;
  if (/^\$\{/.test(t) && !/[A-Za-z]{5,}/.test(t.replace(/\$\{[^}]+\}/g, ""))) return true;
  if (/<\/?(?:td|th|tr|div|span|html|body)\b/i.test(t)) return true;
  if (/escapeHtml\(/.test(t)) return true;
  if (/:\s*Math\.round\(/.test(t)) return true;
  if (/^\•\s*\{/.test(t)) return true;
  if (/\|\s*\{\s*\w+\?:\s*Array/.test(t)) return true;
  if (/\b(?:boolean|void)\s*\|\s*Promise\b/.test(t)) return true;
  return false;
}

/** Template / CSS / HTML / ID strings that are not user-facing copy. */
function isCodeTemplate(s) {
  if (!/\$\{/.test(s)) {
    if (/^Wk \$\{|^\$\{.*\}%$|^• \$\{|^· \$\{/.test(s)) return true;
    return false;
  }
  if (
    /padStart|toISOString|toFixed|toLocaleDateString|linear-gradient|color-mix|encodeURIComponent|getHours|getMinutes|escapeHtml|exportT\(|<[a-z]|Promise<|Record<|startsWith\(|\.length|addon-\$\{|service-\$\{|Date\.now|Math\.(min|max|floor)|MOBILE_|px`|location\.origin|\?search=|= startHour|void handle|void \|/.test(
      s,
    )
  ) {
    return true;
  }
  const withoutInterp = s.replace(/\$\{[^}]+\}/g, " ").trim();
  if (!/\b[A-Za-z]{3,}\s+[A-Za-z]{2,}\b/.test(withoutInterp) && !/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(withoutInterp)) {
    return true;
  }
  return false;
}

function scanFile(rel, text) {
  const lines = text.split(/\n/);
  const hits = [];
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.includes("/*")) inBlockComment = true;
    if (inBlockComment) {
      if (line.includes("*/")) inBlockComment = false;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    if (line.includes("console.")) continue;
    if (line.includes('from "') || line.includes("from '")) continue;
    if (/className=\{?[`"']/.test(line) && !/placeholder=|aria-|title=|alt=|label=|toast\./.test(line) && !/>[A-Za-z]/.test(line)) continue;
    if (/reports[/\\]utils[/\\]export\.ts$/.test(rel) && /exportMetric|exportColumnHeaderFromKey|escapeHtml|<td|<th|<html|exportT\(/.test(line)) continue;
    if (/\bt\s*\(\s*[`'"]web\./.test(line) && !/defaultValue:/.test(line)) continue;

    // English defaultValue in t()
    for (const m of line.matchAll(/defaultValue:\s*["'`]([^"'`]{3,})["'`]/g)) {
      if (/[A-Za-z]{3,}/.test(m[1]) && !skipLiteral(m[1])) {
        hits.push({ line: i + 1, kind: "defaultValue", text: m[1].slice(0, 80) });
      }
    }

    const jsxText = [...line.matchAll(/>([^<{][^<]*[A-Za-z][^<]*)</g)].map((m) => m[1].trim());
    const attrs = [
      ...line.matchAll(/(?:placeholder|aria-label|title|alt|label|description)=\{?["'`]([^"'`]{2,})["'`]/g),
    ].map((m) => m[1]);
    const toasts = [
      ...line.matchAll(/(?:toast\.(?:error|success|info|warning|message)|window\.confirm|confirm|alert|throw new Error)\((?:`([^`]{4,})`|"([^"]{4,})"|'([^']{4,})')/g),
    ].map((m) => m[1] ?? m[2] ?? m[3]);
    const quotes = [...line.matchAll(/(?:label|title|name|subtitle):\s*["']((?:[A-Z][^"'\\]{2,}|[^"'\\]{0,40}\s+[A-Za-z][^"'\\]{2,}))["']/g)].map((m) => m[1]);
    const templates = [...line.matchAll(/`([^`]{8,})`/g)].map((m) => m[1]);

    const candidates = [...jsxText, ...attrs, ...toasts];
    for (const s of [...quotes, ...templates]) {
      if (/[A-Z]/.test(s) && (/\s/.test(s) || /[!?]/.test(s) || s.length > 18)) candidates.push(s);
    }

    for (const raw of candidates) {
      const s = raw.replace(/\s+/g, " ").trim();
      if (skipLiteral(s)) continue;
      if (isCodeTemplate(s)) continue;
      if (/^t\(/.test(trimmed) && s.length < 30) continue;
      hits.push({ line: i + 1, kind: "literal", text: s.slice(0, 100) });
    }
  }
  return hits;
}

const byFile = new Map();
for (const scanRoot of SCAN_ROOTS) {
  for (const file of walk(scanRoot)) {
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, "utf8");
    const hits = scanFile(rel, text);
    if (hits.length > 0) byFile.set(rel, hits);
  }
}

const ranked = [...byFile.entries()]
  .map(([file, hits]) => ({ file, count: hits.length, hits: hits.slice(0, 15) }))
  .sort((a, b) => b.count - a.count);

const outPath = path.join(root, "packages/i18n/provider-web-leftovers.json");
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      scannedAt: new Date().toISOString(),
      totalFiles: ranked.length,
      totalHits: ranked.reduce((s, r) => s + r.count, 0),
      files: ranked,
    },
    null,
    2,
  ),
);

console.log(
  `i18n:scan:provider found ${ranked.reduce((s, r) => s + r.count, 0)} hits in ${ranked.length} files`,
);
console.log(`Report: ${path.relative(root, outPath)}`);
if (ranked.length > 0) {
  console.log("Top files:");
  for (const r of ranked.slice(0, 10)) {
    console.log(`  ${r.count}\t${r.file}`);
  }
}

const thresholdArg = process.argv.find((a) => a.startsWith("--threshold="));
const THRESHOLD = thresholdArg ? Number(thresholdArg.split("=")[1]) : 0;
const total = ranked.reduce((s, r) => s + r.count, 0);
if (total > THRESHOLD) {
  console.error(`Exceeds threshold ${THRESHOLD} (${total} hits)`);
  process.exit(1);
}
