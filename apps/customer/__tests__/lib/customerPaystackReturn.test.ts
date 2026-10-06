import {
  getCustomerPaystackAuthReturnUrl,
  matchesCheckoutSuccessReturnUrl,
  matchesPaystackAuthSessionReturn,
  paystackAuthSessionReturnPrefix,
  CHECKOUT_SUCCESS_PATH,
} from "@/lib/payments/customerPaystackReturn";

jest.mock("@/lib/web-url", () => ({
  getWebCustomerBaseUrl: () => "https://app.beautonomi.com",
}));

describe("customerPaystackReturn", () => {
  it("builds HTTPS auth return with context=app", () => {
    const url = getCustomerPaystackAuthReturnUrl(CHECKOUT_SUCCESS_PATH, { booking_id: "b1" });
    expect(url).toMatch(/^https:\/\/app\.beautonomi\.com\/checkout\/success\?/);
    expect(url).toContain("booking_id=b1");
    expect(url).toContain("context=app");
  });

  it("auth session prefix matches Paystack redirect with extra query params", () => {
    const prefix = paystackAuthSessionReturnPrefix(CHECKOUT_SUCCESS_PATH);
    const redirect =
      "https://app.beautonomi.com/checkout/success?booking_id=b1&context=app&reference=ref123";
    expect(matchesPaystackAuthSessionReturn(redirect, prefix)).toBe(true);
    expect(matchesCheckoutSuccessReturnUrl(redirect, { bookingId: "b1" })).toBe(true);
  });
});
