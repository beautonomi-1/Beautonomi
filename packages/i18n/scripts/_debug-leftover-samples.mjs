import fs from "node:fs";
import {
  collectInScopeKeys,
  flattenLocale,
  isCustomerSurfaceLeftover,
  LOCALES_DIR,
} from "./_customer-surfaces-scope.mjs";

const locale = process.argv[2] ?? "af";
const limit = Number(process.argv[3] ?? 15);
const scope = collectInScopeKeys();
const enFlat = flattenLocale(JSON.parse(fs.readFileSync(`${LOCALES_DIR}/en.json`, "utf8")));
const locFlat = flattenLocale(JSON.parse(fs.readFileSync(`${LOCALES_DIR}/${locale}.json`, "utf8")));
let n = 0;
for (const key of scope) {
  const en = enFlat.get(key);
  if (typeof en !== "string") continue;
  const loc = locFlat.get(key);
  if (!isCustomerSurfaceLeftover(en, loc)) continue;
  console.log("---", key);
  console.log("EN:", en.slice(0, 120));
  console.log("LOC:", String(loc).slice(0, 120));
  if (++n >= limit) break;
}
