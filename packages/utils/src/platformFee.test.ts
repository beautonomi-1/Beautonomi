import { describe, expect, it } from "vitest";
import { normalizePlatformFeeFields } from "./platformFee";

describe("normalizePlatformFeeFields", () => {
  it("maps legacy service_fee fields to canonical platform_fee fields", () => {
    const row = normalizePlatformFeeFields({
      id: "booking-1",
      service_fee_amount: "25.50",
      service_fee_percentage: "0.05",
      service_fee_config_id: "config-1",
      service_fee_paid_by: "customer",
    });

    expect(row.platform_fee_amount).toBe(25.5);
    expect(row.platform_fee_percentage).toBe(0.05);
    expect(row.platform_fee_config_id).toBe("config-1");
    expect(row.platform_fee_paid_by).toBe("customer");
    expect(row.service_fee_amount).toBe(25.5);
  });

  it("prefers canonical platform_fee fields when both names are present", () => {
    const row = normalizePlatformFeeFields({
      platform_fee_amount: 30,
      platform_fee_percentage: 0.1,
      service_fee_amount: 15,
      service_fee_percentage: 0.05,
    });

    expect(row.platform_fee_amount).toBe(30);
    expect(row.platform_fee_percentage).toBe(0.1);
    expect(row.service_fee_amount).toBe(30);
    expect(row.service_fee_percentage).toBe(0.1);
  });
});
