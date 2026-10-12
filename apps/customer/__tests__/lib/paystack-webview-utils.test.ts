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
