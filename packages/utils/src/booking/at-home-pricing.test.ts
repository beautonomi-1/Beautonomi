import { describe, expect, it } from "vitest";
import {
  catalogHasAnyAtHomePriceAdjustment,
  computeAtHomeLinePrice,
  hasAtHomePriceAdjustment,
  houseCallAdjustmentForSnapshotLine,
  lineHasHouseCallAdjustment,
  resolveAtHomeAdjustmentForOffering,
  sumHouseCallAdjustmentsFromSnapshot,
} from "./at-home-pricing";

describe("at-home-pricing", () => {
  it("hasAtHomePriceAdjustment is true only for positive amounts", () => {
    expect(hasAtHomePriceAdjustment(50)).toBe(true);
    expect(hasAtHomePriceAdjustment(0)).toBe(false);
    expect(hasAtHomePriceAdjustment(-10)).toBe(false);
    expect(hasAtHomePriceAdjustment(null)).toBe(false);
  });

  it("computeAtHomeLinePrice applies adjustment only at home", () => {
    expect(computeAtHomeLinePrice(100, 50, false)).toEqual({
      basePrice: 100,
      displayPrice: 100,
      adjustmentApplied: 0,
    });
    expect(computeAtHomeLinePrice(100, 50, true)).toEqual({
      basePrice: 100,
      displayPrice: 150,
      adjustmentApplied: 50,
    });
    expect(computeAtHomeLinePrice(100, 0, true)).toEqual({
      basePrice: 100,
      displayPrice: 100,
      adjustmentApplied: 0,
    });
  });

  it("resolveAtHomeAdjustmentForOffering uses parent adjustment for variants", () => {
    const offerings = [
      { id: "parent", parent_service_id: null, at_home_price_adjustment: 40 },
      { id: "variant-a", parent_service_id: "parent", at_home_price_adjustment: 0 },
    ];
    expect(resolveAtHomeAdjustmentForOffering(offerings, "parent")).toBe(40);
    expect(resolveAtHomeAdjustmentForOffering(offerings, "variant-a")).toBe(40);
  });

  it("catalogHasAnyAtHomePriceAdjustment scans menu rows", () => {
    expect(
      catalogHasAnyAtHomePriceAdjustment([
        { at_home_price_adjustment: 0 },
        { at_home_price_adjustment: 25 },
      ])
    ).toBe(true);
    expect(catalogHasAnyAtHomePriceAdjustment([{ at_home_price_adjustment: 0 }])).toBe(false);
  });

  it("snapshot helpers ignore zero or missing adjustments", () => {
    expect(lineHasHouseCallAdjustment({ price: 100, base_price: 100, at_home_price_adjustment: 0 })).toBe(
      false
    );
    expect(lineHasHouseCallAdjustment({ price: 150, base_price: 100, at_home_price_adjustment: 50 })).toBe(
      true
    );
    expect(houseCallAdjustmentForSnapshotLine({ price: 150, base_price: 100 })).toBe(50);
    expect(sumHouseCallAdjustmentsFromSnapshot([{ price: 150, base_price: 100, at_home_price_adjustment: 50 }])).toBe(
      50
    );
  });
});
