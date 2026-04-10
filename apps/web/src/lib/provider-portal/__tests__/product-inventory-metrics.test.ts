import { describe, expect, it } from "vitest";
import { displayRetailPriceMin, retailStockValue, effectiveStockQuantity } from "../product-inventory-metrics";

describe("product-inventory-metrics", () => {
  it("sums variant qty × retail for stock value (parent retail often 0)", () => {
    const p = {
      has_variants: true,
      retail_price: 0,
      quantity: 0,
      track_stock_quantity: true,
      product_variants: [
        { quantity: 2, retail_price: 50 },
        { quantity: 1, retail_price: 100 },
      ],
    };
    expect(retailStockValue(p)).toBe(2 * 50 + 1 * 100);
    expect(effectiveStockQuantity(p)).toBe(3);
    expect(displayRetailPriceMin(p)).toBe(50);
  });

  it("uses parent row when no variants", () => {
    const p = {
      has_variants: false,
      retail_price: 25,
      quantity: 4,
      track_stock_quantity: true,
      product_variants: [] as { quantity?: number; retail_price?: number }[],
    };
    expect(retailStockValue(p)).toBe(100);
  });

  it("excludes stock from retail value when not tracked", () => {
    const p = {
      has_variants: false,
      retail_price: 99,
      quantity: 10,
      track_stock_quantity: false,
    };
    expect(retailStockValue(p)).toBe(0);
  });
});
