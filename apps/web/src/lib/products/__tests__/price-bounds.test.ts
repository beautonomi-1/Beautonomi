import { describe, expect, it } from "vitest";
import {
  productCatalogAmountError,
  productTaxRateError,
  variantCatalogPricesError,
} from "../price-bounds";

describe("product catalog bounds (F3-01)", () => {
  it("rejects negative and oversized prices", () => {
    expect(productCatalogAmountError("retail_price", -5)).toMatch(/retail_price/);
    expect(productCatalogAmountError("supply_price", 1_000_001)).toMatch(/supply_price/);
    expect(productCatalogAmountError("retail_price", 99.5)).toBeNull();
  });

  it("rejects tax_rate outside 0–100", () => {
    expect(productTaxRateError(150)).toMatch(/tax_rate/);
    expect(productTaxRateError(-1)).toMatch(/tax_rate/);
    expect(productTaxRateError(15)).toBeNull();
  });

  it("rejects a variant with a negative retail price", () => {
    expect(
      variantCatalogPricesError([{ retail_price: -5, supply_price: 0 }]),
    ).toMatch(/variants\[0\]\.retail_price/);
  });
});
