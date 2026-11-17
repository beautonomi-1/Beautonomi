import { describe, expect, it } from "vitest";
import { commissionRatePatch } from "../staff-commission-patch-fields";

describe("PATCH commission_rate sync", () => {
  it("syncs every rate column when service and product rates match", () => {
    expect(commissionRatePatch(40, {})).toEqual({
      commission_rate: 40,
      commission_enabled: true,
      service_commission_rate: 40,
      product_commission_rate: 40,
      commission_percentage: 40,
    });
  });

  it("writes both columns when a blank product rate still pays the service rate", () => {
    expect(
      commissionRatePatch(30, {
        service_commission_rate: 40,
        product_commission_rate: null,
        commission_rate: 40,
      }),
    ).toEqual({
      commission_rate: 30,
      commission_enabled: true,
      service_commission_rate: 30,
      product_commission_rate: 30,
      commission_percentage: 30,
    });
  });

  it("does not touch split columns when service and product differ", () => {
    expect(
      commissionRatePatch(40, {
        service_commission_rate: 30,
        product_commission_rate: 20,
      }),
    ).toEqual({
      commission_rate: 40,
      commission_enabled: true,
    });
  });

  it("clears split columns on null only when they were equal", () => {
    expect(
      commissionRatePatch(null, {
        service_commission_rate: 25,
        product_commission_rate: 25,
      }),
    ).toEqual({
      commission_rate: null,
      commission_enabled: false,
      service_commission_rate: null,
      product_commission_rate: null,
      commission_percentage: null,
    });
    expect(
      commissionRatePatch(null, {
        service_commission_rate: 25,
        product_commission_rate: 20,
      }),
    ).toEqual({
      commission_rate: null,
      commission_enabled: false,
    });
  });

  it("keeps a product rate when the blank service rate does not match it", () => {
    expect(
      commissionRatePatch(10, {
        service_commission_rate: null,
        product_commission_rate: 10,
        commission_rate: 40,
      }),
    ).toEqual({
      commission_rate: 10,
      commission_enabled: true,
    });
  });
});
