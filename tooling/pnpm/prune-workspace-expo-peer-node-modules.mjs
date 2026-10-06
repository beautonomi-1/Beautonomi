#!/usr/bin/env node
/**
 * pnpm may link expo peers under workspace native modules (expo-sms-user-consent,
 * paycloud-same-terminal). expo-doctor treats those as duplicate install paths
 * even when versions match. Peers are satisfied by the mobile apps — prune only
 * the redundant nested copies.
 */
import { rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspacePackages = ["expo-sms-user-consent", "paycloud-same-terminal"];

for (const name of workspacePackages) {
  for (const dep of ["expo", "expo-modules-core", "expo-asset"]) {
    const target = path.join(root, "packages", name, "node_modules", dep);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
    }
  }
}
