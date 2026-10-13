import {
  normalizeProviderPayoutRail,
  providerPayoutRailUsesBankAccounts,
  providerPayoutRailUsesStripeConnect,
} from "@/lib/payments/providerPayoutRail";

describe("providerPayoutRail", () => {
  it("normalizes flutterwave from API", () => {
    expect(normalizeProviderPayoutRail("flutterwave")).toBe("flutterwave");
  });

  it("treats flutterwave like paystack for bank-account payouts", () => {
    expect(providerPayoutRailUsesBankAccounts("flutterwave")).toBe(true);
    expect(providerPayoutRailUsesStripeConnect("flutterwave")).toBe(false);
  });
});
