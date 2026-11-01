import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const routePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "route.ts",
);

describe("provider booking create — no platform fee", () => {
  const source = readFileSync(routePath, "utf8");

  it("does not calculate a platform fee on create", () => {
    expect(source).not.toContain("getEffectivePlatformFeeConfig");
    expect(source).not.toContain("calculatePlatformFeeAmount");
    expect(source).toMatch(/const platformFeeAmount = 0;/);
    expect(source).toMatch(/platform_fee_paid_by: null/);
  });
});
