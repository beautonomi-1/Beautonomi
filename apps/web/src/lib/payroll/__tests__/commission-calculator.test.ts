import { describe, expect, it } from "vitest";
import { STAFF_COMMISSION_REVENUE_TYPES } from "@/lib/reports/constants";

describe("payroll commission base", () => {
  it("uses provider_earnings only — excludes tip, travel, tax, platform fee", () => {
    expect(STAFF_COMMISSION_REVENUE_TYPES).toEqual(["provider_earnings"]);
    expect(STAFF_COMMISSION_REVENUE_TYPES).not.toContain("tip");
    expect(STAFF_COMMISSION_REVENUE_TYPES).not.toContain("travel_fee");
    expect(STAFF_COMMISSION_REVENUE_TYPES).not.toContain("tax");
    expect(STAFF_COMMISSION_REVENUE_TYPES).not.toContain("platform_fee");
  });
});
