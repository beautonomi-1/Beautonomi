import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity } from "./_wave-a-translate.mjs";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const zu = JSON.parse(fs.readFileSync(path.join(localesDir, "zu.json"), "utf8"));

function flat(o, p = "", m = new Map()) {
  for (const [k, v] of Object.entries(o || {})) {
    const f = p ? `${p}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flat(v, f, m);
    else if (typeof v === "string") m.set(f, v);
  }
  return m;
}

const PREFIXES = [
  "common",
  "auth",
  "authGate",
  "checkout",
  "booking",
  "payments",
  "validation",
  "errors",
  "time",
  "bookingLifecycle",
  "customer.mobile",
  "provider.mobile",
  "web.global.cityWaitlist",
  "web.global.marketAvailability",
];

const ef = flat(en);
const zf = flat(zu);
const uniq = new Set();

for (const [key, v] of ef) {
  if (!PREFIXES.some((p) => key === p || key.startsWith(`${p}.`))) continue;
  if (isIdentity(v)) continue;
  if (zf.get(key) === v) uniq.add(v);
}

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "../_work/zu-leftover-en-strings.json");
fs.writeFileSync(out, JSON.stringify([...uniq].sort((a, b) => a.length - b.length), null, 2) + "\n");
console.log(`zu-identical EN strings: ${uniq.size} → ${out}`);
