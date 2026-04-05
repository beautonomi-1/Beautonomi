#!/usr/bin/env node
/**
 * Sets TENANT_API_HINTS_STRICT=1 then runs check-non-admin-api-tenant-hints.mjs (portable on Windows/macOS/Linux).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.TENANT_API_HINTS_STRICT = "1";
const dir = dirname(fileURLToPath(import.meta.url));
const child = spawnSync(process.execPath, [join(dir, "check-non-admin-api-tenant-hints.mjs")], {
  stdio: "inherit",
  env: process.env,
});
process.exit(child.status ?? 1);
