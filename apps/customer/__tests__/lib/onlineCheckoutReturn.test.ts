import { parseOnlineCheckoutReturnUrl } from "@/lib/payments/onlineCheckoutReturn";

describe("parseOnlineCheckoutReturnUrl", () => {
  it("returns reference and session_id from checkout return URLs", () => {
    expect(
      parseOnlineCheckoutReturnUrl(
        "https://www.beautonomi.com/checkout/success?reference=ref_1&session_id=cs_test_abc",
      ),
    ).toEqual({
      reference: "ref_1",
      sessionId: "cs_test_abc",
      transactionId: null,
      status: null,
    });
  });

  it("parses Flutterwave tx_ref and transaction_id", () => {
    expect(
      parseOnlineCheckoutReturnUrl(
        "https://www.beautonomi.com/checkout/success?tx_ref=ref_fw&transaction_id=999&status=successful",
      ),
    ).toEqual({
      reference: "ref_fw",
      sessionId: null,
      transactionId: "999",
      status: "successful",
    });
  });
});
