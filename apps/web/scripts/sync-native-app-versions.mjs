#!/usr/bin/env node
/**
 * Reads Expo `version` from apps/customer and apps/provider app.config.js
 * and writes apps/web/src/lib/store/native-app-versions.generated.json
 * for production hosts where sibling app folders are not deployed.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const appsRoot = join(webRoot, "..");
const outPath = join(webRoot, "src", "lib", "store", "native-app-versions.generated.json");

const APP_KEYS = ["customer", "provider"];
const VERSION_PATTERN = /version:\s*["']([^"']+)["']/;

function readVersion(app) {
  const configPath = join(appsRoot, app, "app.config.js");
  if (!existsSync(configPath)) {
    console.warn(`[sync-native-app-versions] missing ${configPath}`);
    return null;
  }
  const content = readFileSync(configPath, "utf8");
  const match = content.match(VERSION_PATTERN);
  if (!match?.[1]) {
    console.warn(`[sync-native-app-versions] no version in ${configPath}`);
    return null;
  }
  return match[1];
}

const payload = {
  customer: readVersion("customer"),
  provider: readVersion("provider"),
  synced_at: new Date().toISOString(),
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[sync-native-app-versions] wrote ${outPath}`, payload);
