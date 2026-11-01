import { describe, expect, it } from "vitest";

/** Mirrors PATCH /api/provider/staff/[id] commission_rate branch. */
function commissionPatchFields(
  incoming: number | null,
  serviceRate: number | null,
  productRate: number | null,
): Record<string, unknown> {
  const splitRatesEqual = serviceRate === productRate;
  const update: Record<string, unknown> = {};
  if (incoming === null) {
    update.commission_rate = null;
    update.commission_enabled = false;
    if (splitRatesEqual) {
      update.service_commission_rate = null;
      update.product_commission_rate = null;
    }
  } else {
    update.commission_rate = incoming;
    update.commission_enabled = true;
    if (splitRatesEqual) {
      update.service_commission_rate = incoming;
      update.product_commission_rate = incoming;
    }
  }
  return update;
}

describe("PATCH commission_rate sync", () => {
  it("syncs all three columns when service and product rates match", () => {
    expect(commissionPatchFields(40, null, null)).toEqual({
      commission_rate: 40,
      commission_enabled: true,
      service_commission_rate: 40,
      product_commission_rate: 40,
    });
  });

  it("does not touch split columns when service and product differ", () => {
    expect(commissionPatchFields(40, 30, 20)).toEqual({
      commission_rate: 40,
      commission_enabled: true,
    });
  });

  it("clears split columns on null only when they were equal", () => {
    expect(commissionPatchFields(null, 25, 25)).toEqual({
      commission_rate: null,
      commission_enabled: false,
      service_commission_rate: null,
      product_commission_rate: null,
    });
    expect(commissionPatchFields(null, 25, 20)).toEqual({
      commission_rate: null,
      commission_enabled: false,
    });
  });

  it("treats one null and one number as unequal", () => {
    expect(commissionPatchFields(10, null, 10)).toEqual({
      commission_rate: 10,
      commission_enabled: true,
    });
  });
});
