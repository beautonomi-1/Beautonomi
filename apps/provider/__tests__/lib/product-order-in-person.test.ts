import { productOrderInPersonDue } from "../../src/lib/product-order-in-person";

describe("productOrderInPersonDue (F4-06)", () => {
  it("uses the server remaining-due when present", () => {
    expect(productOrderInPersonDue({ amount_still_due: 12.345, total_amount: 50 })).toBe(12.35);
  });

  it("derives remaining from total minus gift and wallet", () => {
    expect(
      productOrderInPersonDue({
        amount_still_due: undefined,
        total_amount: 100,
        gift_card_amount: 20,
        wallet_amount: 15,
      }),
    ).toBe(65);
  });
});
