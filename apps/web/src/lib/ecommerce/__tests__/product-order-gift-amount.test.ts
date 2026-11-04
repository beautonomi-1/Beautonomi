import { describe, expect, it } from "vitest";
import { plannedProductOrderGiftAmount } from "../product-order-gift-card";

describe("plannedProductOrderGiftAmount", () => {
  it("uses only the card balance when the card is smaller than the order", () => {
    expect(
      plannedProductOrderGiftAmount({ requested: null, orderTotal: 100, cardBalance: 30 }),
    ).toBe(30);
  });

  it("does not take more than the order", () => {
    expect(
      plannedProductOrderGiftAmount({ requested: null, orderTotal: 100, cardBalance: 150 }),
    ).toBe(100);
  });

  it("respects an explicit requested amount", () => {
    expect(
      plannedProductOrderGiftAmount({ requested: 10, orderTotal: 100, cardBalance: 50 }),
    ).toBe(10);
  });
});
