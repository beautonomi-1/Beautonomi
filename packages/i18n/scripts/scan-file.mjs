#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scan-file.mjs <file>");
  process.exit(1);
}
const text = fs.readFileSync(file, "utf8");
const lines = text.split(/\r?\n/);

const PATTERNS = [
  />\s*[A-Za-z][^<{]{2,80}\s*</g,
  /Alert\.alert\s*\(\s*["'`][^"'`]{3,}/g,
  /placeholder=["'][^"']{3,}["']/g,
  /title=["'][^"']{3,}["']/g,
];

const results = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      if (/^\s*>\s*[{}]\s*</.test(m[0])) continue;
      results.push({ line: i + 1, snippet: m[0].replace(/\s+/g, " ").slice(0, 120) });
    }
  }
}
console.log(JSON.stringify(results, null, 2));
console.log("TOTAL:", results.length);
