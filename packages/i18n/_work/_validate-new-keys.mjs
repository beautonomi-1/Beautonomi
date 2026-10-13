/** Drop new-key translations that lost a brand name or placeholder so --missing-only refills them. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeWriteJson } from "../scripts/_safe-write-json.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "../src/locales");
const newKeys = JSON.parse(fs.readFileSync(path.join(here, "_new-keys.json"), "utf8"));
const BRANDS = ["Yoco", "Beautonomi", "PayCloud"];
const OVERLAYS = new Set(["en", "en-GB", "en-US", "en-AU", "pt-BR", "es-MX"]);

const parentOf = (o, k) => {
  const parts = k.split(".");
  let cur = o;
  for (const p of parts.slice(0, -1)) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[p];
  }
  return cur && typeof cur === "object" ? [cur, parts[parts.length - 1]] : null;
};

const bad = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const code = f.replace(/\.json$/, "");
  if (OVERLAYS.has(code)) continue;
  const file = path.join(dir, f);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const drop = [];
  for (const [k, src] of Object.entries(newKeys)) {
    const pk = parentOf(json, k);
    if (!pk) continue;
    const [parent, leaf] = pk;
    const val = parent[leaf];
    if (typeof val !== "string") continue;
    const vars = [...src.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[0]);
    const brandOk = BRANDS.every((b) => !src.includes(b) || val.includes(b));
    const varsOk = vars.every((v) => val.includes(v));
    const leaked = /[\uE000\uE001]/.test(val);
    if (!brandOk || !varsOk || leaked) {
      delete parent[leaf];
      drop.push(k.split(".").slice(-1)[0]);
    }
  }
  if (drop.length) {
    safeWriteJson(file, json);
    bad[code] = drop;
  }
}
console.log(JSON.stringify(bad, null, 1));
