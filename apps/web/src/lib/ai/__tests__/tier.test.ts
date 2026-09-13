import { describe, expect, it } from "vitest";
import { entitlementTierToRouterTier, isTierEqualOrCheaper } from "@/lib/ai/tier";

describe("entitlementTierToRouterTier", () => {
  it("maps cheap to lite", () => {
    expect(entitlementTierToRouterTier("cheap")).toBe("lite");
  });
  it("maps standard to flash", () => {
    expect(entitlementTierToRouterTier("standard")).toBe("flash");
  });
  it("maps pro to pro", () => {
    expect(entitlementTierToRouterTier("pro")).toBe("pro");
  });
});

describe("isTierEqualOrCheaper", () => {
  it("allows lite as failover for flash", () => {
    expect(isTierEqualOrCheaper("lite", "flash")).toBe(true);
  });
  it("blocks pro as failover for lite", () => {
    expect(isTierEqualOrCheaper("pro", "lite")).toBe(false);
  });
});
