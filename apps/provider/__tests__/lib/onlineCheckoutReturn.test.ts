import { parseOnlineCheckoutReturnUrl } from "@/lib/payments/onlineCheckoutReturn";

describe("parseOnlineCheckoutReturnUrl (provider)", () => {
  it("extracts reference and session_id from return URLs", () => {
    expect(
      parseOnlineCheckoutReturnUrl(
        "provider://settings/subscription/payment-return?reference=ref_1&session_id=cs_test_abc",
      ),
    ).toEqual({ reference: "ref_1", sessionId: "cs_test_abc" });
  });
});
