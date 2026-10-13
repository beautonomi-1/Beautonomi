import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "../src/locales");
const flatten = (o, p = "", out = new Map()) => {
  for (const [k, v] of Object.entries(o)) {
    const f = p ? `${p}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, f, out);
    else out.set(f, String(v));
  }
  return out;
};
const read = (f) => flatten(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const en = read("en.json");
const fr = read("fr.json");
const re = /cardMachine|CardMachine|card-machine|yoco|Yoco|paycloud|Paycloud|bookingDetail\.|bookings\.detail\.(refund|dialogs)/;
const keys = [...en.keys()].filter((k) => re.test(k) && !fr.has(k));
fs.writeFileSync(path.join(here, "_new-keys.json"), JSON.stringify(Object.fromEntries(keys.map((k) => [k, en.get(k)])), null, 1));
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const loc = read(f);
  const missing = keys.filter((k) => !loc.has(k)).length;
  const hasProv = [...loc.keys()].some((k) => k.startsWith("provider.mobile.screens.bookingDetail."));
  console.log(`${f}\tprovMobile=${hasProv}\tmissing=${missing}/${keys.length}`);
}
