#!/usr/bin/env node
/**
 * Publish production EAS Updates for customer (iOS + Android) with --message.
 * Not wired in apps/customer/package.json scripts — changing those scripts shifts
 * the Expo fingerprint and breaks OTA for existing store builds.
 *
 * Run from repo root:
 *   pnpm --filter customer exec node ../../tooling/eas/customer-production-ota.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const customerDir = path.resolve(__dirname, "../../apps/customer");

const env = {
  ...process.env,
  EXPO_NO_DOTENV: "1",
  APP_ENV: "production",
  CI: "1",
};

const baseArgs = [
  "update",
  "--channel",
  "production",
  "--environment",
  "production",
  "--non-interactive",
  "--message",
  "Production OTA",
];

for (const platform of ["ios", "android"]) {
  const result = spawnSync(
    "eas",
    [...baseArgs, "--platform", platform],
    { cwd: customerDir, env, stdio: "inherit", shell: true },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
