import fs from "node:fs";
import {
  collectInScopeKeys,
  flattenLocale,
  isCustomerSurfaceLeftover,
  LOCALES_DIR,
  TARGET_LOCALES,
} from "./_customer-surfaces-scope.mjs";

const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(`${LOCALES_DIR}/en.json`, "utf8")));
const all = new Set();
for (const locale of TARGET_LOCALES) {
  const locFlat = flattenLocale(JSON.parse(fs.readFileSync(`${LOCALES_DIR}/${locale}.json`, "utf8")));
  for (const key of scope) {
    const en = enFlat.get(key);
    if (typeof en !== "string") continue;
    if (isCustomerSurfaceLeftover(en, locFlat.get(key))) all.add(en);
  }
}
console.log("unique English phrases still leftover in any locale:", all.size);
