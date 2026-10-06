import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: actual.readFileSync,
  };
});

function readGeneratedVersions(): { customer: string; provider: string } {
  return JSON.parse(
    readFileSync(join(__dirname, "../native-app-versions.generated.json"), "utf8")
  ) as { customer: string; provider: string };
}

describe("getNativeAppCodebaseVersions fallback", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("falls back to generated JSON when app.config.js is missing", async () => {
    const { getNativeAppCodebaseVersions } = await import("../native-app-version");
    const generated = readGeneratedVersions();
    const versions = getNativeAppCodebaseVersions();
    expect(versions.customer).toBe(generated.customer);
    expect(versions.provider).toBe(generated.provider);
  });
});
