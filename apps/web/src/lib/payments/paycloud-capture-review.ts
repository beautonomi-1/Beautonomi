/**
 * A terminal capture can succeed on the machine while taking a different amount
 * than the balance due. That money is real but was NOT applied to the entity, so
 * surfaces must never render it as a plain success — otherwise staff believe the
 * balance is cleared and the client walks out.
 *
 * Mirrors `isPaycloudCaptureUnderReview` in apps/provider/src/hooks/usePayCloud.ts.
 */
export type PaycloudAmountMatchStatus =
  | "exact"
  | "over"
  | "under"
  | "mismatch"
  | "pending";

export function isPaycloudCaptureUnderReview(
  payment:
    | { status?: string | null; amount_match_status?: string | null }
    | null
    | undefined,
): boolean {
  if (!payment || payment.status !== "successful") return false;
  return (
    payment.amount_match_status === "under" ||
    payment.amount_match_status === "mismatch"
  );
}
