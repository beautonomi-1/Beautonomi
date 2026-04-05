#!/usr/bin/env node
/**
 * Install debug APK with x86_64 native libs only (Windows + x86_64 AVD).
 * Does not start Metro — run `pnpm dev` (or `pnpm dev:customer`) separately.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const customerRoot = path.join(repoRoot, "apps", "customer");
const androidDir = path.join(customerRoot, "android");

if (!fs.existsSync(path.join(androidDir, "gradlew.bat")) && !fs.existsSync(path.join(androidDir, "gradlew"))) {
  console.error("[android:emu:win] Missing apps/customer/android — run `npx expo prebuild` in apps/customer first.");
  process.exit(1);
}

const port = process.env.EXPO_METRO_PORT || process.env.RCT_METRO_PORT || "8081";
const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const args = [
  "app:installDebug",
  "-x",
  "lint",
  "-x",
  "test",
  `--PreactNativeDevServerPort=${port}`,
  "-PreactNativeArchitectures=x86_64",
];

const r = spawnSync(gradlew, args, {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env },
});

if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`\n[android:emu:win] Installed. Start Metro (e.g. pnpm dev:customer) on port ${port} and open the app.`);
