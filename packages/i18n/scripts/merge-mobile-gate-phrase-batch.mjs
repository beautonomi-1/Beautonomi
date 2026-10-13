#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHRASES } from "./_mobile-gate-phrase-batch.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const mapPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../_maps/t-mobile-fr-ar.json");
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
Object.assign(map, PHRASES);
safeWriteJson(mapPath, map);
console.log("merged", Object.keys(PHRASES).length, "phrases into t-mobile-fr-ar.json");
