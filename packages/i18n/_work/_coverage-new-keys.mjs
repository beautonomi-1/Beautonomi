import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "../src/locales");
const newKeys = JSON.parse(fs.readFileSync(path.join(here, "_new-keys.json"), "utf8"));
const get = (o, k) => k.split(".").reduce((a, p) => (a && typeof a === "object" ? a[p] : undefined), o);
const OVERLAYS = new Set(["en", "en-GB", "en-US", "en-AU", "pt-BR", "es-MX"]);
const brandOnly = new Set(["Yoco", "Beautonomi"]);
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const code = f.replace(/\.json$/, "");
  if (OVERLAYS.has(code)) continue;
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const missing = Object.keys(newKeys).filter((k) => typeof get(j, k) !== "string");
  const sameAsEn = Object.entries(newKeys).filter(([k, v]) => get(j, k) === v && !brandOnly.has(v)).map(([k]) => k.split(".").pop());
  console.log(`${code}\tmissing=${missing.length}\tsameAsEnglish=${sameAsEn.length}${sameAsEn.length ? " " + sameAsEn.join(",") : ""}`);
}
