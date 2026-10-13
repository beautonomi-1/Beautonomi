import {
  extractHostedCheckoutReturn,
  isCancelledPaystackUrl,
} from "@/lib/paystack-webview-utils";

describe("isCancelledPaystackUrl", () => {
  it("detects standard and wallet cancel query flags", () => {
    expect(isCancelledPaystackUrl("https://app.example.com/checkout/cancelled?cancelled=1")).toBe(
      true,
    );
    expect(
      isCancelledPaystackUrl(
        "https://app.example.com/account-settings/wallet?topup_cancelled=1&context=app",
      ),
    ).toBe(true);
    expect(
      isCancelledPaystackUrl("customer://wallet-return?topup_cancelled=1"),
    ).toBe(true);
    expect(isCancelledPaystackUrl("https://app.example.com/shop/cancelled?order_id=o1")).toBe(
      true,
    );
  });

  it("detects pay-remaining, additional-charge, membership, gift card and Flutterwave cancels", () => {
    expect(
      isCancelledPaystackUrl("customer://book/paystack?booking_id=b1&cancelled=1"),
    ).toBe(true);
    expect(
      isCancelledPaystackUrl(
        "https://app.example.com/account-settings/bookings/b1?pay_remaining=1&pay_remaining_cancelled=1",
      ),
    ).toBe(true);
    expect(
      isCancelledPaystackUrl("https://app.example.com/account-settings/bookings/b1?charge_cancelled=1"),
    ).toBe(true);
    expect(
      isCancelledPaystackUrl("https://app.example.com/explore?membership_cancelled=1"),
    ).toBe(true);
    expect(
      isCancelledPaystackUrl("https://app.example.com/gift-card/purchase/cancelled?context=app"),
    ).toBe(true);
    expect(
      isCancelledPaystackUrl("customer://book/paystack?status=cancelled&tx_ref=t1"),
    ).toBe(true);
    expect(
      isCancelledPaystackUrl("customer://book/paystack?status=successful&tx_ref=t1"),
    ).toBe(false);
  });

  it("parses Flutterwave tx_ref and transaction_id", () => {
    const url =
      "https://app.example.com/checkout/success?status=successful&tx_ref=ref_fw&transaction_id=12345";
    const parsed = extractHostedCheckoutReturn(url);
    expect(parsed.reference).toBe("ref_fw");
    expect(parsed.transactionId).toBe("12345");
    expect(parsed.status).toBe("successful");
  });

  it("returns false for success returns", () => {
    expect(
      isCancelledPaystackUrl("https://app.example.com/checkout/success?reference=r1&context=app"),
    ).toBe(false);
  });
});
