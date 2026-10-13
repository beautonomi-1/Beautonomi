import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "../src/locales");
const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(here, "_new-keys.json"), "utf8")));
const get = (o, k) => k.split(".").reduce((a, p) => (a && typeof a === "object" ? a[p] : undefined), o);
const code = process.argv[2];
const j = JSON.parse(fs.readFileSync(path.join(dir, `${code}.json`), "utf8"));
for (const k of keys) console.log(`${k.split(".").slice(-1)[0]}\t${get(j, k)}`);
