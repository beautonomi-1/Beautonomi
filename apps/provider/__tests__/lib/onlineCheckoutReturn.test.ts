import { parseOnlineCheckoutReturnUrl } from "@/lib/payments/onlineCheckoutReturn";

describe("parseOnlineCheckoutReturnUrl (provider)", () => {
  it("extracts reference and session_id from return URLs", () => {
    expect(
      parseOnlineCheckoutReturnUrl(
        "provider://settings/subscription/payment-return?reference=ref_1&session_id=cs_test_abc",
      ),
    ).toEqual({
      reference: "ref_1",
      sessionId: "cs_test_abc",
      transactionId: null,
      status: null,
    });
  });

  it("extracts Flutterwave transaction_id and status", () => {
    expect(
      parseOnlineCheckoutReturnUrl(
        "https://app.example/provider/subscription?tx_ref=order_1&transaction_id=123456&status=successful",
      ),
    ).toEqual({
      reference: "order_1",
      sessionId: null,
      transactionId: "123456",
      status: "successful",
    });
  });
});
