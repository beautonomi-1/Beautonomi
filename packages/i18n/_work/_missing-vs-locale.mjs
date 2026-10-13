import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const flatten = (o, p = "", out = new Map()) => {
  for (const [k, v] of Object.entries(o)) {
    const f = p ? `${p}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, f, out);
    else out.set(f, String(v));
  }
  return out;
};
const en = flatten(JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8")));
const code = process.argv[2] || "fr";
const loc = flatten(JSON.parse(fs.readFileSync(path.join(dir, `${code}.json`), "utf8")));
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
const rows = [];
for (const [k, v] of en) {
  if (filter && !filter.test(k)) continue;
  if (!loc.has(k) || loc.get(k) === v) rows.push([k, v, loc.has(k) ? "same" : "missing"]);
}
if (process.argv[4] === "--json") console.log(JSON.stringify(Object.fromEntries(rows.map((r) => [r[0], r[1]])), null, 1));
else console.log(rows.map((r) => `${r[2]}\t${r[0]}`).join("\n") + `\ncount=${rows.length}`);
