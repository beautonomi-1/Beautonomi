#!/usr/bin/env node
/**
 * One-off helper: set app_version_settings.latest_version from Expo app.config.js
 * using apps/web/.env.local Supabase credentials (typically staging/test project).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, "apps", "web", ".env.local");
const VERSION_PATTERN = /version:\s*["']([^"']+)["']/;

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function readExpoVersion(app) {
  const configPath = join(root, "apps", app, "app.config.js");
  const match = readFileSync(configPath, "utf8").match(VERSION_PATTERN);
  if (!match?.[1]) throw new Error(`No version in ${configPath}`);
  return match[1].trim();
}

const targetVersion = readExpoVersion("customer");
const providerVersion = readExpoVersion("provider");
if (targetVersion !== providerVersion) {
  console.warn(
    `[sync-app-version-settings] customer (${targetVersion}) != provider (${providerVersion}); using customer`
  );
}

const env = loadEnv(envPath);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[sync-app-version-settings] missing Supabase env in apps/web/.env.local");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: before, error: readErr } = await supabase
  .from("app_version_settings")
  .select("app, platform, min_version, latest_version, force_update")
  .order("app")
  .order("platform");
if (readErr) {
  console.error("[sync-app-version-settings] read failed:", readErr.message);
  process.exit(1);
}

console.log("[sync-app-version-settings] host:", new URL(url).hostname);
console.log("[sync-app-version-settings] before:", before);

const { data: updated, error: updErr } = await supabase
  .from("app_version_settings")
  .update({ latest_version: targetVersion })
  .neq("latest_version", targetVersion)
  .select("app, platform, min_version, latest_version, force_update");
if (updErr) {
  console.error("[sync-app-version-settings] update failed:", updErr.message);
  process.exit(1);
}

const { data: after } = await supabase
  .from("app_version_settings")
  .select("app, platform, min_version, latest_version, force_update")
  .order("app")
  .order("platform");

console.log(
  `[sync-app-version-settings] updated ${updated?.length ?? 0} row(s) to latest_version=${targetVersion}`
);
console.log("[sync-app-version-settings] after:", after);
