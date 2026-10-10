#!/usr/bin/env node
/** Repeat harvest phrase map + apply until no progress. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditCustomerSurfaces } from "./_customer-surfaces-scope.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
let prev = Infinity;
for (let i = 0; i < 8; i++) {
  spawnSync(process.execPath, [path.join(dir, "harvest-customer-surfaces-phrases.mjs")], { stdio: "inherit" });
  spawnSync(process.execPath, [path.join(dir, "apply-customer-surfaces-harvested.mjs")], { stdio: "inherit" });
  const left = auditCustomerSurfaces().totalLeftover;
  console.log(`Harvest loop ${i + 1}: total leftover ${left}`);
  if (left >= prev) break;
  prev = left;
}
