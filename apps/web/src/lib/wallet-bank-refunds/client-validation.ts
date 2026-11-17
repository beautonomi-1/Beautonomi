import { percentOf, roundCurrency, subtractMoney } from "@beautonomi/utils";
export type BankRefundClientSettings = {
  enabled?: boolean;
  min_amount?: number;
  max_amount_per_request?: number | null;
  fee_type?: "fixed" | "percentage";
  fee_value?: number;
  sla_business_days?: number;
  help_text?: string | null;
};

/** Same rounding as `computeWalletBankRefundFee` on the server. */
export function bankRefundFee(amount: number, settings: BankRefundClientSettings): { fee: number; net: number } {
  const value = Math.max(0, Number(settings.fee_value) || 0);
  const raw = settings.fee_type === "percentage" ? percentOf(amount, value) : roundCurrency(value);
  const fee = roundCurrency(Math.min(raw, amount));
  return { fee, net: subtractMoney(amount, fee) };
}

export function parseRefundAmount(raw: string): number {
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) ? roundCurrency(n) : NaN;
}

export type BankRefundAmountError = "invalid" | "below_min" | "above_max" | "above_eligible" | "fee_exceeds";

/** Mirrors the POST route checks so the form blocks requests the API would reject. */
export function validateBankRefundAmount(
  amount: number,
  settings: BankRefundClientSettings,
  eligible: number,
): BankRefundAmountError | null {
  if (!Number.isFinite(amount) || amount <= 0) return "invalid";
  if (settings.min_amount != null && amount < settings.min_amount) return "below_min";
  if (settings.max_amount_per_request != null && amount > settings.max_amount_per_request) return "above_max";
  if (amount > eligible) return "above_eligible";
  if (bankRefundFee(amount, settings).net <= 0) return "fee_exceeds";
  return null;
}
