#!/usr/bin/env node
/**
 * Run remote customer-surface translation for each target locale (sequential).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TARGET_LOCALES } from "./_customer-surfaces-scope.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "apply-customer-surfaces-translations.mjs");
const only = process.argv.find((a) => a.startsWith("--from="))?.replace("--from=", "");
let started = !only;

for (const locale of TARGET_LOCALES) {
  if (!started) {
    if (locale === only) started = true;
    else continue;
  }
  console.log(`\n========== ${locale} ==========`);
  const r = spawnSync(process.execPath, [script, "--remote", `--locale=${locale}`], {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error(`Locale ${locale} apply exited ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

console.log("\nAll locales processed.");
