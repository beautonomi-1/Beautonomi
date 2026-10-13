import { describe, expect, it } from "vitest";
import {
  productCartLineKey,
  resolveProductLineUnitPrice,
  stockLimitForCatalogProduct,
} from "./resolve-product-line-unit-price";

describe("resolveProductLineUnitPrice", () => {
  it("uses variant retail price when variant id is set", () => {
    expect(
      resolveProductLineUnitPrice(
        {
          retail_price: 100,
          variants: [{ id: "v1", retail_price: 120 }],
        },
        "v1",
      ),
    ).toBe(120);
  });

  it("falls back to product retail price", () => {
    expect(resolveProductLineUnitPrice({ retail_price: 85 }, null)).toBe(85);
  });

  it("uses product price when variant retail is zero", () => {
    expect(
      resolveProductLineUnitPrice(
        { retail_price: 85, variants: [{ id: "v1", retail_price: 0 }] },
        "v1",
      ),
    ).toBe(85);
  });
});

describe("productCartLineKey", () => {
  it("includes variant segment", () => {
    expect(productCartLineKey("p1", "v1")).toBe("p1:v1");
    expect(productCartLineKey("p1")).toBe("p1:");
  });
});

describe("stockLimitForCatalogProduct", () => {
  it("returns null when stock is not tracked", () => {
    expect(stockLimitForCatalogProduct({ track_stock_quantity: false, quantity: 3 })).toBeNull();
  });

  it("uses variant quantity when provided", () => {
    expect(
      stockLimitForCatalogProduct({ track_stock_quantity: true, quantity: 10 }, { quantity: 2 }),
    ).toBe(2);
  });
});
