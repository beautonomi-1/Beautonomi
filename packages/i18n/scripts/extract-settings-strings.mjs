#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../apps/web/src/app/provider/settings",
);

const patterns = [
  /title="([^"]+)"/g,
  /subtitle="([^"]+)"/g,
  /loadingMessage="([^"]+)"/g,
  /toast\.(success|error)\("([^"]+)"/g,
  /label: "([^"]+)"/g,
  /placeholder="([^"]+)"/g,
];

function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, a);
    else if (e.name === "page.tsx") a.push(p);
  }
  return a;
}

const result = {};
for (const p of walk(root)) {
  const rel = path.relative(root, p).replace(/\\/g, "/");
  if (rel === "yoco-terminals/page.tsx" || rel === "page.tsx") continue;
  const s = fs.readFileSync(p, "utf8");
  if (s.includes("redirect(")) continue;
  const found = new Set();
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      const val = (m[m.length - 1] || m[1]).trim();
      if (!val.includes("t(") && !val.includes("${")) found.add(val);
    }
  }
  if (found.size) result[rel] = [...found];
}

const outPath = path.join(__dirname, "../settings-strings-extract.json");
fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${Object.keys(result).length} pages to ${outPath}`);
