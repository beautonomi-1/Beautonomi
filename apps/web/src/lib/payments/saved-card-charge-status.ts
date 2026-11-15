export type SavedCardChargeOutcome = "success" | "failed" | "still_open" | "hosted_fallback";

/** Maps Paystack chargeAuthorization `data.status` to booking payment handling. */
export function classifySavedCardChargeStatus(chargeStatus: string): SavedCardChargeOutcome {
  const status = chargeStatus.trim().toLowerCase();
  if (status === "failed") return "failed";
  if (status === "success") return "success";
  if (status === "pending" || status === "ongoing" || status === "processing" || status === "queued") {
    return "still_open";
  }
  return "hosted_fallback";
}
