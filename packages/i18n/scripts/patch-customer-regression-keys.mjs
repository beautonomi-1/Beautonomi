#!/usr/bin/env node
/** Restore known-good SA booking + shop strings (regression fixes). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeWriteJson } from "./_safe-write-json.mjs";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const SA = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

const BOOK_ENGINE = {
  af: {
    visitSalon: "Besoek die salon",
    atYourHomeTitle: "By jou huis",
  },
  zu: { visitSalon: "Vakashela isaluni" },
  xh: { visitSalon: "Vakashela isaluni" },
};

const SHOP_AF = {
  "customer.mobile.tabs.shop.locationHours.notListed": "Ure nie gelys nie",
  "customer.mobile.tabs.shop.pickupStore.directions": "Aanwysings",
  "provider.mobile.components.bookingCreateReadiness.title":
    "Bespreking-checklys · {{completed}}/{{total}}",
};

function deepSet(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

for (const loc of SA) {
  const fp = path.join(localesDir, `${loc}.json`);
  const data = JSON.parse(fs.readFileSync(fp, "utf8"));
  let n = 0;
  const be = BOOK_ENGINE[loc];
  if (be) {
    for (const [k, v] of Object.entries(be)) {
      deepSet(data, `web.book.engine.${k}`, v);
      n += 1;
    }
  }
  if (loc === "af") {
    for (const [k, v] of Object.entries(SHOP_AF)) {
      deepSet(data, k, v);
      n += 1;
    }
  }
  if (n > 0) {
    safeWriteJson(fp, data);
    console.log(`${loc}: patched ${n} regression keys`);
  }
}
