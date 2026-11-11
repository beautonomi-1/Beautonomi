import { MAX_CLIENT_AMOUNT_MAJOR } from "@/lib/payments/client-amount-bounds";

/**
 * F3-22: percentage fees are 0–100; fixed fees share the client money cap.
 */
export function cancellationFeeAmountError(
  feeType: string | null | undefined,
  feeAmount: number | null | undefined,
): string | null {
  if (feeAmount == null) return null;
  if (!Number.isFinite(feeAmount) || feeAmount < 0) {
    return "fee_amount must be 0 or greater";
  }
  if (feeType === "percentage" && feeAmount > 100) {
    return "Percentage fee_amount must be between 0 and 100";
  }
  if (feeType !== "percentage" && feeAmount > MAX_CLIENT_AMOUNT_MAJOR) {
    return `Fixed fee_amount must be at most ${MAX_CLIENT_AMOUNT_MAJOR}`;
  }
  return null;
}
