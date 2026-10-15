export type SavedCardChargeOutcome = "success" | "failed" | "hosted_fallback";

/** Maps Paystack chargeAuthorization `data.status` to booking payment handling. */
export function classifySavedCardChargeStatus(chargeStatus: string): SavedCardChargeOutcome {
  const status = chargeStatus.trim();
  if (status === "failed") return "failed";
  if (status === "success") return "success";
  return "hosted_fallback";
}
