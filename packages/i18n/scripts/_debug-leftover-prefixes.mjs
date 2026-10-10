import fs from "node:fs";
import {
  collectInScopeKeys,
  flattenLocale,
  isCustomerSurfaceLeftover,
  LOCALES_DIR,
} from "./_customer-surfaces-scope.mjs";

const locale = process.argv[2] ?? "zu";
const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(`${LOCALES_DIR}/en.json`, "utf8")));
const locFlat = flattenLocale(JSON.parse(fs.readFileSync(`${LOCALES_DIR}/${locale}.json`, "utf8")));
const pref = new Map();
for (const k of scope) {
  const en = enFlat.get(k);
  if (!isCustomerSurfaceLeftover(en, locFlat.get(k))) continue;
  const p = k.split(".").slice(0, 3).join(".");
  pref.set(p, (pref.get(p) || 0) + 1);
}
console.log(
  [...pref.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([p, c]) => `${c} ${p}`)
    .join("\n"),
);
