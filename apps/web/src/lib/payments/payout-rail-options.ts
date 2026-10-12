/** Client-safe payout rail helpers (no Stripe / Supabase server imports). */

export type PayoutRail = "paystack" | "stripe" | "flutterwave";

/** Normalize API `payout_rail` for provider portal UI and POST bodies. */
export function normalizePayoutRailOption(value: string | null | undefined): PayoutRail {
  if (value === "stripe" || value === "flutterwave" || value === "paystack") return value;
  return "paystack";
}

/** Bank-account payout destinations (Paystack + Flutterwave transfer recipients). */
export function payoutRailUsesBankAccounts(rail: PayoutRail): boolean {
  return rail === "paystack" || rail === "flutterwave";
}
