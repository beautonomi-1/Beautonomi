import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import generated from "./native-app-versions.generated.json";

export const NATIVE_APP_KEYS = ["customer", "provider"] as const;
export type NativeAppKey = (typeof NATIVE_APP_KEYS)[number];

export type NativeAppCodebaseVersions = Record<NativeAppKey, string | null>;

const VERSION_PATTERN = /version:\s*["']([^"']+)["']/;

/** Resolve apps/{customer,provider} whether cwd is apps/web or the monorepo root. */
function nativeAppsRoot(): string {
  const candidates = [
    join(process.cwd(), ".."),
    join(process.cwd(), "apps"),
  ];
  for (const root of candidates) {
    if (existsSync(join(root, "customer", "app.config.js"))) {
      return root;
    }
  }
  return candidates[0];
}

function readVersionFromAppConfig(app: NativeAppKey): string | null {
  const configPath = join(nativeAppsRoot(), app, "app.config.js");
  if (!existsSync(configPath)) return null;
  const content = readFileSync(configPath, "utf8");
  const match = content.match(VERSION_PATTERN);
  return match?.[1]?.trim() ?? null;
}

/**
 * Expo `version` from each native app's app.config.js.
 * Prefers live files in dev/monorepo checkouts; falls back to build-synced JSON on hosted web-only deploys.
 */
export function getNativeAppCodebaseVersions(): NativeAppCodebaseVersions {
  const customer = readVersionFromAppConfig("customer") ?? generated.customer ?? null;
  const provider = readVersionFromAppConfig("provider") ?? generated.provider ?? null;
  return { customer, provider };
}
