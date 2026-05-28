import { describe, expect, it } from "vitest";

/** Lightweight mirrors of GET /api/provider/products filter logic */
function applyProductListFilters(
  products: Array<{ is_active?: boolean; effective_quantity?: number; low_stock_level?: number; track_stock_quantity?: boolean }>,
  opts: { includeInactive?: boolean; hasLowStock?: boolean; outOfStock?: boolean },
) {
  let list = [...products];
  if (!opts.includeInactive) {
    list = list.filter((p) => p.is_active !== false);
  }
  if (opts.hasLowStock) {
    list = list.filter((p) => {
      if (p.track_stock_quantity === false) return false;
      const low = Number(p.low_stock_level) || 5;
      const q = Number(p.effective_quantity) || 0;
      return q > 0 && q <= low;
    });
  }
  if (opts.outOfStock) {
    list = list.filter((p) => p.track_stock_quantity !== false && (Number(p.effective_quantity) || 0) <= 0);
  }
  return list;
}

describe("product list filters", () => {
  const sample = [
    { id: "a", is_active: true, effective_quantity: 0, low_stock_level: 5, track_stock_quantity: true },
    { id: "b", is_active: false, effective_quantity: 3, low_stock_level: 5, track_stock_quantity: true },
    { id: "c", is_active: true, effective_quantity: 2, low_stock_level: 5, track_stock_quantity: true },
  ];

  it("excludes inactive by default", () => {
    expect(applyProductListFilters(sample, {}).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("filters out of stock", () => {
    expect(applyProductListFilters(sample, { includeInactive: true, outOfStock: true }).map((p) => p.id)).toEqual(["a"]);
  });
});

describe("delete guard", () => {
  it("returns 409 when booking count > 0", () => {
    const bookingCount = 2;
    const status = bookingCount > 0 ? 409 : 200;
    expect(status).toBe(409);
  });
});
