import { describe, expect, it } from "vitest";
import { resolveAdPackAmountMajor, resolveAdPackCurrency } from "../resolve-ad-pack-price";

describe("resolveAdPackAmountMajor", () => {
  it("prefers price_minor over price_zar", () => {
    expect(resolveAdPackAmountMajor({ price_minor: 15050, price_zar: 99 })).toBe(150.5);
  });

  it("falls back to price_zar when price_minor missing", () => {
    expect(resolveAdPackAmountMajor({ price_zar: 42.5 })).toBe(42.5);
  });
});

describe("resolveAdPackCurrency", () => {
  it("uses row currency when set", () => {
    expect(resolveAdPackCurrency({ currency: "USD" })).toBe("USD");
  });

  it("defaults to ZAR", () => {
    expect(resolveAdPackCurrency({})).toBe("ZAR");
  });
});
