#!/usr/bin/env node
/** Migrate i18next v3 `_plural` keys to v4 `_one` / `_other` in all locale JSON files. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");

function migrateNode(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;

  for (const key of [...Object.keys(obj)]) {
    if (!key.endsWith("_plural")) continue;
    const base = key.slice(0, -"_plural".length);
    if (obj[`${base}_one`] === undefined && typeof obj[base] === "string") {
      obj[`${base}_one`] = obj[base];
      delete obj[base];
    }
    if (obj[`${base}_other`] === undefined) {
      obj[`${base}_other`] = obj[key];
    }
    delete obj[key];
  }

  for (const key of [...Object.keys(obj)]) {
    if (
      typeof obj[key] === "string" &&
      obj[`${key}_one`] !== undefined &&
      obj[`${key}_other`] !== undefined
    ) {
      delete obj[key];
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object" && !Array.isArray(value)) migrateNode(value);
  }
}

for (const file of fs.readdirSync(localesDir).filter((f) => f.endsWith(".json"))) {
  const filePath = path.join(localesDir, file);
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  migrateNode(json);
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n");
  console.log("migrated plurals in", file);
}
