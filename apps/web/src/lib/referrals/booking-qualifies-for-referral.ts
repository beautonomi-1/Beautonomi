/**
 * Referral conversion should only run once the first booking is financially real:
 * paid / partially paid, or a $0 total that is already confirmed (no payment step).
 */
export function bookingQualifiesForReferralReward(row: {
  status?: string | null;
  payment_status?: string | null;
  total_amount?: number | string | null;
}): boolean {
  const st = (row.status ?? "").toLowerCase();
  if (st === "cancelled" || st === "canceled") return false;

  const ps = (row.payment_status ?? "").toLowerCase();
  if (ps === "refunded" || ps === "failed") return false;
  if (ps === "paid" || ps === "partially_paid") return true;

  const total = Number(row.total_amount ?? 0);
  if (!Number.isFinite(total)) return false;
  if (total <= 0) {
    return (
      st === "confirmed" ||
      st === "completed" ||
      st === "in_progress" ||
      st === "started" ||
      st === "checked_in" ||
      st === "waiting"
    );
  }

  return false;
}
