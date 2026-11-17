import { describe, expect, it } from "vitest";
import { mergeStoredCheckoutMetadata } from "@/lib/payments/normalize-paystack-metadata";

describe("mergeStoredCheckoutMetadata", () => {
  it("keeps the checkout row when Paystack omits the payment type", () => {
    expect(
      mergeStoredCheckoutMetadata(
        {},
        { gift_card_order_id: "order-1", provider_invoice_id: "inv-1" },
      ),
    ).toEqual({ gift_card_order_id: "order-1", provider_invoice_id: "inv-1" });
  });

  it("lets a present gateway value replace the stored one", () => {
    expect(
      mergeStoredCheckoutMetadata(
        { booking_id: "from-gateway", amount: "" },
        { booking_id: "from-checkout", terminal_order_id: "term-1" },
      ),
    ).toEqual({ booking_id: "from-gateway", terminal_order_id: "term-1" });
  });
});
