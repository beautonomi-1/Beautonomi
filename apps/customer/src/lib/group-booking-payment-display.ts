/**
 * Pure display helpers for customer group-booking payment UI.
 * Keeps badge / "Covered" logic testable and aligned with group-level rollup.
 */

export type PaymentBadgeStyle = { label: string; bg: string; fg: string };

/** Short keys under `customer.mobile.components.groupBookingPayment.*` */
type GroupPaymentTranslate = (key: string, opts?: Record<string, string | number>) => string;

function labelOrFallback(t: GroupPaymentTranslate | undefined, key: string, fallback: string): string {
  return t?.(key) ?? fallback;
}

/** Group-level payment status badge (from computeGroupPaymentRollupFields). */
export function groupPaymentBadge(
  status: string | null | undefined,
  t?: GroupPaymentTranslate,
): PaymentBadgeStyle | null {
  if (!status) return null;
  switch (status) {
    case "paid":
      return { label: labelOrFallback(t, "paid", "Paid"), bg: "#DCFCE7", fg: "#15803D" };
    case "partially_paid":
      return {
        label: labelOrFallback(t, "partiallyPaid", "Partially paid"),
        bg: "#FEF9C3",
        fg: "#854D0E",
      };
    case "pending":
    case "unpaid":
      return { label: labelOrFallback(t, "unpaid", "Unpaid"), bg: "#FEF3C7", fg: "#92400E" };
    case "partial":
      return { label: labelOrFallback(t, "partial", "Partial"), bg: "#FEF9C3", fg: "#854D0E" };
    case "partially_refunded":
      return {
        label: labelOrFallback(t, "partiallyRefunded", "Partially refunded"),
        bg: "#EDE9FE",
        fg: "#6D28D9",
      };
    case "refunded":
      return { label: labelOrFallback(t, "refunded", "Refunded"), bg: "#EDE9FE", fg: "#6D28D9" };
    case "not_invoiced":
      return {
        label: labelOrFallback(t, "notInvoiced", "Not invoiced"),
        bg: "#F3F4F6",
        fg: "#4B5563",
      };
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
  t?: GroupPaymentTranslate,
): PaymentBadgeStyle | null {
  if (groupBalanceDue <= 0) {
    return { label: labelOrFallback(t, "covered", "Covered"), bg: "#DCFCE7", fg: "#15803D" };
  }
  return groupPaymentBadge(participantStatus, t);
}

/** Human-readable payer line for the group payment summary card. */
export function groupPayerSummaryLine(
  opts: {
    isPrimaryPayer: boolean;
    paidBy: string | null;
  },
  t?: GroupPaymentTranslate,
): string | null {
  if (opts.isPrimaryPayer) {
    return labelOrFallback(t, "youPaidForGroup", "You paid for the group");
  }
  if (opts.paidBy) {
    return t?.("paidBy", { name: opts.paidBy }) ?? `Paid by ${opts.paidBy}`;
  }
  return null;
}
