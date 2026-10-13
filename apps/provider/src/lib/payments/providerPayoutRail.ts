export type ProviderPayoutRail = "paystack" | "stripe" | "flutterwave";

export function normalizeProviderPayoutRail(value?: string | null): ProviderPayoutRail {
  if (value === "stripe" || value === "flutterwave" || value === "paystack") return value;
  return "paystack";
}

export function providerPayoutRailUsesBankAccounts(rail: ProviderPayoutRail): boolean {
  return rail === "paystack" || rail === "flutterwave";
}

export function providerPayoutRailUsesStripeConnect(rail: ProviderPayoutRail): boolean {
  return rail === "stripe";
}
