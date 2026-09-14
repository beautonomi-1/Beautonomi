#!/usr/bin/env node
/**
 * Convert physical Tailwind/CSS to logical properties in provider web scope.
 * Preserves calendar time-axis positioning (BookingBlock slot width, drag handles).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SCOPES = [
  "src/app/provider",
  "src/components/provider",
  "src/components/provider-portal",
].map((p) => path.join(ROOT, p));

const EXT = new Set([".tsx", ".ts", ".jsx", ".js", ".css"]);

/** Placeholders for calendar time-axis patterns we must not convert */
const PLACEHOLDER_PREFIX = "__RTL_KEEP_";
let keepCounter = 0;

function protectCalendarTimeAxis(content, filePath) {
  const isCalendar =
    filePath.includes(`${path.sep}calendar${path.sep}`) ||
    /CalendarMobileView|DragDropCalendar|BookingBlock|TimeBlockElement|CurrentTimeIndicator|GestureLayer|TimeColumn|DateColumn|StaffColumn|CalendarGrid/.test(
      path.basename(filePath)
    );

  if (!isCalendar) return { content, keeps: [] };

  const keeps = [];
  const patterns = [
    // Booking block / slot width positioning
    /\bleft-0\.5\b/g,
    /\bright-0\.5\b/g,
    /\bleft-1\b(?!\s*\/)/g, // not left-1/2
    /\bright-1\b(?!\s*\/)/g,
    /\bleft-0\b/g,
    /\bright-0\b/g,
    // Time-axis sticky / offset
    /\bsticky\s+left-0\b/g,
    /\bleft-\[[^\]]+\]/g,
    /\bsm:left-\[[^\]]+\]/g,
    // Time indicator dot offset
    /-ml-1\b/g,
    /-left-1\b/g,
    // Full-width overlay rows aligned to time axis
    /\bleft-\d+\s+sm:left-\[[^\]]+\]\s+right-0\b/g,
  ];

  let result = content;
  for (const re of patterns) {
    result = result.replace(re, (match) => {
      const key = `${PLACEHOLDER_PREFIX}${keepCounter++}__`;
      keeps.push({ key, value: match });
      return key;
    });
  }
  return { content: result, keeps };
}

function restoreKeeps(content, keeps) {
  let result = content;
  for (const { key, value } of keeps) {
    result = result.split(key).join(value);
  }
  return result;
}

function convertTailwind(content) {
  let s = content;

  // Margin / padding / text
  s = s.replace(/\bml-/g, "ms-");
  s = s.replace(/\bmr-/g, "me-");
  s = s.replace(/\bpl-/g, "ps-");
  s = s.replace(/\bpr-/g, "pe-");
  s = s.replace(/\btext-left\b/g, "text-start");
  s = s.replace(/\btext-right\b/g, "text-end");

  // Border sides (avoid border-red, border-rose, rounded, etc.)
  s = s.replace(/\bborder-l-(?!\[)/g, "border-s-");
  s = s.replace(/\bborder-r-(?!\[)/g, "border-e-");
  s = s.replace(/\bborder-l\b(?!-)/g, "border-s");
  s = s.replace(/\bborder-r\b(?!-)/g, "border-e");
  s = s.replace(/\blast:border-r-0\b/g, "last:border-e-0");
  s = s.replace(/\blast:border-r\b/g, "last:border-e");

  // Bracket variants: border-l-[3px] → border-s-[3px]
  s = s.replace(/\bborder-l-\[/g, "border-s-[");
  s = s.replace(/\bborder-r-\[/g, "border-e-[");
  s = s.replace(/\bsm:border-l-\[/g, "sm:border-s-[");
  s = s.replace(/\bsm:border-r-\[/g, "sm:border-e-[");
  s = s.replace(/\bborder-l-/g, "border-s-");
  s = s.replace(/\bborder-r-/g, "border-e-");

  // Position: left/right → start/end (preserve left-1/2 / right-1/2 centering)
  s = s.replace(/\b(-?)left-(?!1\/2)(\d+(?:\.\d+)?)\b/g, "$1start-$2");
  s = s.replace(/\b(-?)right-(?!1\/2)(\d+(?:\.\d+)?)\b/g, "$1end-$2");
  s = s.replace(/\b(sm:|md:|lg:|xl:|2xl:)(-?)left-(?!1\/2)(\d+(?:\.\d+)?)\b/g, "$1$2start-$3");
  s = s.replace(/\b(sm:|md:|lg:|xl:|2xl:)(-?)right-(?!1\/2)(\d+(?:\.\d+)?)\b/g, "$1$2end-$3");

  // inset-x patterns sometimes written as left-0 right-0 — handled above per-token

  return s;
}

function convertInlineCss(content) {
  let s = content;
  // Print styles and inline CSS in template strings
  s = s.replace(/\bborder-left\b/g, "border-inline-start");
  s = s.replace(/\bborder-right\b/g, "border-inline-end");
  s = s.replace(/\bborder-left-color\b/g, "border-inline-start-color");
  s = s.replace(/\bborder-right-color\b/g, "border-inline-end-color");
  s = s.replace(/\bpadding-left\b/g, "padding-inline-start");
  s = s.replace(/\bpadding-right\b/g, "padding-inline-end");
  s = s.replace(/\bmargin-left\b/g, "margin-inline-start");
  s = s.replace(/\bmargin-right\b/g, "margin-inline-end");
  s = s.replace(/\btext-align:\s*left\b/g, "text-align: start");
  s = s.replace(/\btext-align:\s*right\b/g, "text-align: end");
  s = s.replace(/\bleft:\s*0\b/g, "inset-inline-start: 0");
  s = s.replace(/\bright:\s*0\b/g, "inset-inline-end: 0");
  return s;
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (EXT.has(path.extname(name))) files.push(full);
  }
  return files;
}

function countReplacements(before, after) {
  if (before === after) return 0;
  // rough: count differing class tokens
  const re =
    /\b(ms-|me-|ps-|pe-|text-start|text-end|border-s|border-e|start-|end-|-start-|-end-)\S*/g;
  const afterMatches = after.match(re) || [];
  const beforeLogical = before.match(re) || [];
  return Math.max(afterMatches.length - beforeLogical.length, 1);
}

const changed = [];
let totalHits = 0;

for (const scope of SCOPES) {
  for (const file of walk(scope)) {
    const original = fs.readFileSync(file, "utf8");
    let { content, keeps } = protectCalendarTimeAxis(original, file);
    content = convertTailwind(content);
    content = convertInlineCss(content);
    content = restoreKeeps(content, keeps);

    if (content !== original) {
      const hits = countReplacements(original, content);
      totalHits += hits;
      changed.push({
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        hits,
      });
      fs.writeFileSync(file, content, "utf8");
    }
  }
}

const reportPath = path.join(ROOT, "scripts", "rtl-logical-sweep-report.txt");
const lines = [
  "Provider Web RTL Logical Properties Sweep",
  `Date: ${new Date().toISOString()}`,
  "",
  "Scope:",
  "  - apps/web/src/app/provider",
  "  - apps/web/src/components/provider",
  "  - apps/web/src/components/provider-portal",
  "",
  "Conversions:",
  "  ml-* → ms-*, mr-* → me-*, pl-* → ps-*, pr-* → pe-*",
  "  text-left → text-start, text-right → text-end",
  "  border-l → border-s, border-r → border-e",
  "  left-* → start-*, right-* → end-* (layout/icons/badges)",
  "",
  "Preserved (calendar time-axis):",
  "  BookingBlock slot left/right positioning, drag handles, sticky time column",
  "",
  `Files changed: ${changed.length}`,
  `Approximate replacement groups: ${totalHits}`,
  "",
  "Per-file counts:",
  ...changed
    .sort((a, b) => b.hits - a.hits)
    .map(({ file, hits }) => `  ${hits}\t${file}`),
  "",
];

fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
console.log(`Changed ${changed.length} files. Report: ${reportPath}`);
