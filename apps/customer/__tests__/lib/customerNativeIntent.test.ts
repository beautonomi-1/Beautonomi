import { redirectSystemPath } from "../../app/+native-intent";

describe("customer +native-intent payment returns", () => {
  it("maps checkout success to book/paystack with query", () => {
    const out = redirectSystemPath({
      path: "https://app.beautonomi.com/checkout/success?booking_id=b1&reference=r1&context=app",
      initial: true,
    });
    expect(out).toContain("/(app)/book/paystack");
    expect(out).toContain("reference=r1");
  });

  it("maps membership payment_type to membership-paystack", () => {
    const out = redirectSystemPath({
      path: "https://app.beautonomi.com/checkout/success?payment_type=membership&reference=r1&context=app",
      initial: true,
    });
    expect(out).toContain("/(app)/membership-paystack");
  });

  it("maps shop payment callback", () => {
    const out = redirectSystemPath({
      path: "https://app.beautonomi.com/shop/payment-callback?order_id=o1&context=app",
      initial: true,
    });
    expect(out).toBe("/(app)/shop/paystack?order_id=o1&context=app");
  });

  it("maps shop cancelled to shop/paystack", () => {
    const out = redirectSystemPath({
      path: "https://app.beautonomi.com/shop/cancelled?order_id=o1&context=app",
      initial: true,
    });
    expect(out).toContain("/(app)/shop/paystack");
  });

  it("maps wallet HTTPS cancel to wallet-return", () => {
    const out = redirectSystemPath({
      path: "https://app.beautonomi.com/account-settings/wallet?topup_cancelled=1&context=app",
      initial: true,
    });
    expect(out).toContain("/(app)/wallet-return");
  });

  it("maps customer:// deep link", () => {
    const out = redirectSystemPath({
      path: "customer://book/paystack?reference=abc",
      initial: false,
    });
    expect(out).toContain("/(app)/book/paystack");
    expect(out).toContain("reference=abc");
  });
});
