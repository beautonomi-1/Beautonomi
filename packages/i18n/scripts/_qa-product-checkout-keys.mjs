#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgI18n = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.join(pkgI18n, "../..");
const en = JSON.parse(
  fs.readFileSync(path.join(pkgI18n, "src/locales/en.json"), "utf8"),
);
const pc = en.customer.mobile.screens.productCheckout;
const src = fs.readFileSync(
  path.join(repoRoot, "apps/customer/app/(app)/(tabs)/shop/product-checkout.tsx"),
  "utf8",
);
const keys = [...src.matchAll(/pc\("([^"]+)"/g)].map((m) => m[1]);
const uniq = [...new Set(keys)];
const missing = uniq.filter((k) => !(k in pc));
console.log(JSON.stringify({ keysUsed: uniq.length, missing }, null, 2));
process.exit(missing.length ? 1 : 0);
