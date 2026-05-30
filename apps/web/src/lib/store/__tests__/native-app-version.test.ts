import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getNativeAppCodebaseVersions } from "../native-app-version";

describe("getNativeAppCodebaseVersions", () => {
  it("matches Expo version fields in app.config.js", () => {
    const versions = getNativeAppCodebaseVersions();
    expect(versions.customer).toBe("1.0.48");
    expect(versions.provider).toBe("1.0.48");
  });

  it("reads the same version as sync-native-app-versions.mjs", () => {
    const generated = JSON.parse(
      readFileSync(join(__dirname, "../native-app-versions.generated.json"), "utf8")
    ) as { customer: string; provider: string };
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
    const versions = readVersions();
    expect(versions.customer).toBe("1.0.48");
    expect(versions.provider).toBe("1.0.48");
  });
});
