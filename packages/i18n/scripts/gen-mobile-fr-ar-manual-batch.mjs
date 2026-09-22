#!/usr/bin/env node
/** Build _work/mobile-fr-ar-leftover-manual.json from ROWS triples. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROWS } from "./_mobile-fr-ar-leftover-rows.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "_work/mobile-fr-ar-leftover-manual.json");

/** @type {Record<string, { fr: string, ar: string }>} */
const out = {};
for (const [en, fr, ar] of ROWS) {
  if (!en || !fr || !ar) continue;
  out[en] = { fr, ar };
}

fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${Object.keys(out).length} manual rows → ${dest}`);
