/**
 * Pure display helpers for customer group-booking payment UI.
 * Keeps badge / "Covered" logic testable and aligned with group-level rollup.
 */

export type PaymentBadgeStyle = { label: string; bg: string; fg: string };

/** Group-level payment status badge (from computeGroupPaymentRollupFields). */
export function groupPaymentBadge(status: string | null | undefined): PaymentBadgeStyle | null {
  if (!status) return null;
  switch (status) {
    case "paid":
      return { label: "Paid", bg: "#DCFCE7", fg: "#15803D" };
    case "partially_paid":
      return { label: "Partially paid", bg: "#FEF9C3", fg: "#854D0E" };
    case "pending":
    case "unpaid":
      return { label: "Unpaid", bg: "#FEF3C7", fg: "#92400E" };
    case "partial":
      return { label: "Partial", bg: "#FEF9C3", fg: "#854D0E" };
    case "partially_refunded":
      return { label: "Partially refunded", bg: "#EDE9FE", fg: "#6D28D9" };
    case "refunded":
      return { label: "Refunded", bg: "#EDE9FE", fg: "#6D28D9" };
    case "not_invoiced":
      return { label: "Not invoiced", bg: "#F3F4F6", fg: "#4B5563" };
    default:
      return {
        label: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " "),
        bg: "#F3F4F6",
        fg: "#4B5563",
      };
  }
}

/**
 * Per-participant payment badge. When the group balance is fully settled,
 * show "Covered" instead of a child booking's misleading pending/unpaid state.
 */
export function participantPaymentBadge(
  participantStatus: string | null | undefined,
  groupBalanceDue: number,
): PaymentBadgeStyle | null {
  if (groupBalanceDue <= 0) {
    return { label: "Covered", bg: "#DCFCE7", fg: "#15803D" };
  }
  return groupPaymentBadge(participantStatus);
}

/** Human-readable payer line for the group payment summary card. */
export function groupPayerSummaryLine(opts: {
  isPrimaryPayer: boolean;
  paidBy: string | null;
}): string | null {
  if (opts.isPrimaryPayer) return "You paid for the group";
  if (opts.paidBy) return `Paid by ${opts.paidBy}`;
  return null;
}
