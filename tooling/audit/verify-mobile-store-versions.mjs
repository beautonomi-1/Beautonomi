#!/usr/bin/env node
/**
 * Repo-side store version preflight for mobile release.
 * Does NOT call Play/ASC APIs — operator must confirm max build in consoles.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readConfig(app) {
  const file = path.join(ROOT, "apps", app, "app.config.js");
  const src = fs.readFileSync(file, "utf8");
  const version = src.match(/version:\s*"([^"]+)"/)?.[1];
  const buildNumber = src.match(/buildNumber:\s*"([^"]+)"/)?.[1];
  const versionCode = src.match(/versionCode:\s*(\d+)/)?.[1];
  const bundleId =
    app === "customer"
      ? src.match(/bundleIdentifier:\s*"([^"]+)"/)?.[1]
      : src.match(/bundleIdentifier:\s*"([^"]+)"/)?.[1];
  return { version, buildNumber, versionCode, bundleId };
}

const customer = readConfig("customer");
const provider = readConfig("provider");

console.log("=== Mobile store version preflight (repo only) ===\n");
console.log("Customer:", customer);
console.log("Provider:", provider);
console.log("\nOperator checklist (manual):");
console.log("- Google Play: max versionCode for com.beautonomi and com.beautonomi.partner must be < repo versionCode.");
console.log("- App Store Connect: new buildNumber per upload; marketing version must increase from live 1.0.96.");
console.log("- If 292 already used on either app, bump that app in app.config.js before EAS build.\n");

const ok =
  customer.version === provider.version &&
  customer.buildNumber === provider.buildNumber &&
  customer.versionCode === provider.versionCode;

if (!ok) {
  console.error("FAIL: customer and provider version fields are out of sync.");
  process.exit(1);
}
console.log("PASS: customer and provider version fields are aligned.");
