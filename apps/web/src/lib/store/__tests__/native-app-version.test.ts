import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getNativeAppCodebaseVersions } from "../native-app-version";

const VERSION_PATTERN = /(?:APP_MARKETING_VERSION|version)\s*[:=]\s*["']([^"']+)["']/;

function readExpoVersionFromAppConfig(app: "customer" | "provider"): string {
  const configPath = join(__dirname, "../../../../../", app, "app.config.js");
  const content = readFileSync(configPath, "utf8");
  const match = content.match(VERSION_PATTERN);
  if (!match?.[1]) {
    throw new Error(`No version in ${configPath}`);
  }
  return match[1].trim();
}

function readGeneratedVersions(): { customer: string; provider: string } {
  return JSON.parse(
    readFileSync(join(__dirname, "../native-app-versions.generated.json"), "utf8")
  ) as { customer: string; provider: string };
}

describe("getNativeAppCodebaseVersions", () => {
  it("matches Expo version fields in app.config.js", () => {
    const versions = getNativeAppCodebaseVersions();
    expect(versions.customer).toBe(readExpoVersionFromAppConfig("customer"));
    expect(versions.provider).toBe(readExpoVersionFromAppConfig("provider"));
  });

  it("reads the same version as sync-native-app-versions.mjs", () => {
    const generated = readGeneratedVersions();
    const versions = getNativeAppCodebaseVersions();
    expect(versions.customer).toBe(generated.customer);
    expect(versions.provider).toBe(generated.provider);
  });
});

