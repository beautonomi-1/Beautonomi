import { describe, expect, it } from "vitest";
import { normalizePersistedServiceFeePercentage } from "@/lib/platform-service-fee-settings";

describe("normalizePersistedServiceFeePercentage", () => {
  it("keeps percentage when amount matches subtotal base", () => {
    expect(normalizePersistedServiceFeePercentage(10, 10, [100])).toBe(10);
  });

  it("keeps percentage when amount matches post-discount base", () => {
    expect(normalizePersistedServiceFeePercentage(8, 10, [100, 80])).toBe(10);
  });

  it("zeros percentage when capped amount does not match any base", () => {
    expect(normalizePersistedServiceFeePercentage(15, 10, [100, 80])).toBe(0);
  });

  it("zeros percentage when fee amount is zero but percentage was set", () => {
    expect(normalizePersistedServiceFeePercentage(0, 10, [100])).toBe(0);
  });
});
