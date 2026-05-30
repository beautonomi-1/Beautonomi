import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getNativeAppCodebaseVersions } from "../native-app-version";

const VERSION_PATTERN = /version:\s*["']([^"']+)["']/;

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

describe("getNativeAppCodebaseVersions fallback", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unmock("node:fs");
  });

  it("falls back to generated JSON when app.config.js is missing", async () => {
    vi.doMock("node:fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs")>();
      return {
        ...actual,
        existsSync: vi.fn(() => false),
        readFileSync: actual.readFileSync,
      };
    });

    const { getNativeAppCodebaseVersions: readVersions } = await import("../native-app-version");
    const generated = readGeneratedVersions();
    const versions = readVersions();
    expect(versions.customer).toBe(generated.customer);
    expect(versions.provider).toBe(generated.provider);
  });
});
