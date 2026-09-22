#!/usr/bin/env node
/**
 * Emit b15-translations-*.mjs from _work/b15-rows.json
 * b15-rows.json: [{ "en", "af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss" }, ...]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, "_work");
const rows = JSON.parse(fs.readFileSync(path.join(work, "b15-rows.json"), "utf8"));

function esc(s) {
  return JSON.stringify(s);
}

const chunk = Math.ceil(rows.length / 4);
for (let p = 0; p < 4; p++) {
  const slice = rows.slice(p * chunk, (p + 1) * chunk);
  const letter = ["a", "b", "c", "d"][p];
  const lines = [
    `/** Batch 15 part ${letter.toUpperCase()} — ${slice.length} rows */`,
    `export function applyB15Part${letter.toUpperCase()}(r) {`,
    "  const rows = [",
  ];
  for (const row of slice) {
    const cols = [
      row.en,
      row.af,
      row.zu,
      row.xh,
      row.st,
      row.nso,
      row.tn,
      row.ts,
      row.ve,
      row.ss,
    ];
    lines.push(`    [${cols.map(esc).join(", ")}],`);
  }
  lines.push("  ];");
  lines.push("  for (const row of rows) r(...row);");
  lines.push("}\n");
  fs.writeFileSync(path.join(work, `b15-translations-${letter}.mjs`), lines.join("\n"));
  console.log(`Wrote part ${letter}: ${slice.length} rows`);
}
