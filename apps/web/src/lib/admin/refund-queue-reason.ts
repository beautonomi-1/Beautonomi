import type { BookingRefundSummary } from "@/lib/admin/booking-refund-context";
import { parseRefundAmount } from "@/lib/admin/booking-refund-context";

export type QueueReason =
  | "wallet_credit_failed"
  | "refund_stuck_pending"
  | "cash_confirm_overdue"
  | "open_dispute"
  | "refund_support_ticket"
  | "cancelled_unrefunded"
  | "kept_per_policy"
  | "gift_card_voided"
  | "awaiting_cash_confirmation"
  | "awaiting_terminal_reversal"
  | "no_refund_due"
  | "not_applicable";

export const NEEDS_ACTION_REASONS = new Set<QueueReason>([
  "wallet_credit_failed",
  "refund_stuck_pending",
  "cash_confirm_overdue",
  "open_dispute",
  "refund_support_ticket",
  "cancelled_unrefunded",
]);

export type RefundQueueSignals = {
  bookingStatus?: string | null;
  paymentStatus?: string | null;
  remainingRefundable: number;
  retainedFeeTotal?: number;
  giftCardVoidedTotal?: number;
  reservedPendingTotal?: number;
  bookingRefunds?: BookingRefundSummary[];
  hasOpenDispute?: boolean;
  hasRefundSupportTicket?: boolean;
  hasGatewayCapture?: boolean;
};

export type DerivedQueueReason = {
  queue_reason: QueueReason;
  queue_reason_detail: string | null;
  needs_action: boolean;
};

const STUCK_PENDING_MS = 15 * 60 * 1000;

function isCancelledStatus(status: string): boolean {
  return status === "cancelled" || status === "no_show";
}

function isActivePaidBooking(status: string, paymentStatus: string): boolean {
  if (isCancelledStatus(status)) return false;
  const ps = paymentStatus.toLowerCase();
  return (
    ps === "paid" ||
    ps === "partially_paid" ||
    status === "completed" ||
    status === "in_progress" ||
    status === "confirmed" ||
    status === "checked_in"
  );
}

function explainRetainedFee(remaining: number, fee: number): boolean {
  return fee > 0 && Math.abs(remaining - fee) < 0.02;
}

function explainGiftVoid(remaining: number, gift: number): boolean {
  return gift > 0 && Math.abs(remaining - gift) < 0.02;
}

export function deriveQueueReason(signals: RefundQueueSignals): DerivedQueueReason {
  const bookingStatus = String(signals.bookingStatus ?? "");
  const paymentStatus = String(signals.paymentStatus ?? "");
  const remaining = Math.max(0, signals.remainingRefundable);
  const refunds = signals.bookingRefunds ?? [];
  const retainedFee = signals.retainedFeeTotal ?? 0;
  const giftVoid = signals.giftCardVoidedTotal ?? 0;
  const reserved = signals.reservedPendingTotal ?? 0;

  if (!signals.hasGatewayCapture && remaining <= 0 && !isCancelledStatus(bookingStatus)) {
    return {
      queue_reason: "not_applicable",
      queue_reason_detail: null,
      needs_action: false,
    };
  }

  const failed = refunds.find((r) => String(r.status ?? "") === "failed");
  if (failed) {
    return {
      queue_reason: "wallet_credit_failed",
      queue_reason_detail: failed.notes ?? failed.reason ?? null,
      needs_action: true,
    };
  }

  const stuckPending = refunds.find((r) => {
    if (String(r.status ?? "") !== "pending") return false;
    if (String(r.refund_method ?? "").toLowerCase() === "cash") return false;
    const created = r.created_at ? new Date(r.created_at).getTime() : 0;
    return created > 0 && Date.now() - created > STUCK_PENDING_MS;
  });
  if (stuckPending) {
    return {
      queue_reason: "refund_stuck_pending",
      queue_reason_detail: stuckPending.reason ?? null,
      needs_action: true,
    };
  }

  const overdueCash = refunds.find((r) => {
    if (String(r.status ?? "") !== "pending") return false;
    if (String(r.refund_method ?? "").toLowerCase() !== "cash") return false;
    const deadline = (r as { confirmation_deadline_at?: string | null }).confirmation_deadline_at;
    return deadline ? new Date(deadline).getTime() < Date.now() : false;
  });
  if (overdueCash) {
    return {
      queue_reason: "cash_confirm_overdue",
      queue_reason_detail: overdueCash.reason ?? null,
      needs_action: true,
    };
  }

  if (signals.hasOpenDispute) {
    return {
      queue_reason: "open_dispute",
      queue_reason_detail: "Open booking dispute",
      needs_action: true,
    };
  }

  if (signals.hasRefundSupportTicket) {
    return {
      queue_reason: "refund_support_ticket",
      queue_reason_detail: "Support ticket linked to this booking",
      needs_action: true,
    };
  }

  const pendingCash = refunds.find(
    (r) =>
      String(r.status ?? "") === "pending" &&
      String(r.refund_method ?? "").toLowerCase() === "cash",
  );
  if (pendingCash && remaining > 0) {
    return {
      queue_reason: "awaiting_cash_confirmation",
      queue_reason_detail: pendingCash.reason ?? null,
      needs_action: false,
    };
  }

  if (remaining <= 0) {
    return {
      queue_reason: "not_applicable",
      queue_reason_detail: null,
      needs_action: false,
    };
  }

  if (explainRetainedFee(remaining, retainedFee) && isCancelledStatus(bookingStatus)) {
    return {
      queue_reason: "kept_per_policy",
      queue_reason_detail: `Retained fee ${retainedFee.toFixed(2)}`,
      needs_action: false,
    };
  }

  if (explainGiftVoid(remaining, giftVoid)) {
    return {
      queue_reason: "gift_card_voided",
      queue_reason_detail: `Gift card restored (${giftVoid.toFixed(2)})`,
      needs_action: false,
    };
  }

  if (isActivePaidBooking(bookingStatus, paymentStatus) && reserved <= 0) {
    return {
      queue_reason: "no_refund_due",
      queue_reason_detail: "Booking completed or in progress — no automatic refund owed",
      needs_action: false,
    };
  }

  if (isCancelledStatus(bookingStatus)) {
    return {
      queue_reason: "cancelled_unrefunded",
      queue_reason_detail: `${remaining.toFixed(2)} not yet credited to customer wallet`,
      needs_action: true,
    };
  }

  return {
    queue_reason: "no_refund_due",
    queue_reason_detail: null,
    needs_action: false,
  };
}

export function queueReasonLabel(reason: QueueReason): string {
  switch (reason) {
    case "wallet_credit_failed":
      return "Automatic wallet credit failed — retry from this page";
    case "refund_stuck_pending":
      return "Refund stuck pending — retry from this page";
    case "cash_confirm_overdue":
      return "Cash refund confirmation overdue";
    case "open_dispute":
      return "Open dispute — resolve on the dispute page";
    case "refund_support_ticket":
      return "Refund-related support ticket open";
    case "cancelled_unrefunded":
      return "Cancelled — amount not yet credited to customer wallet";
    case "kept_per_policy":
      return "Kept as cancellation / no-show fee — no action needed";
    case "gift_card_voided":
      return "Gift card was restored instead of wallet credit";
    case "awaiting_cash_confirmation":
      return "Cash refund waiting for customer confirmation";
    case "awaiting_terminal_reversal":
      return "Terminal reversal in progress";
    case "no_refund_due":
      return "No refund due";
    default:
      return "—";
  }
}

export function computeDisplayRemaining(args: {
  remainingRefundable: number;
  retainedFeeTotal?: number;
  giftCardVoidedTotal?: number;
  reservedPendingTotal?: number;
  queueReason: QueueReason;
}): number {
  let remaining = Math.max(0, args.remainingRefundable);
  if (args.queueReason === "kept_per_policy") return 0;
  if (args.queueReason === "gift_card_voided") return 0;
  if (args.queueReason === "awaiting_cash_confirmation") {
    remaining = Math.max(0, remaining - (args.reservedPendingTotal ?? 0));
  }
  return remaining;
}

export function sumPendingRefundAmount(refunds: BookingRefundSummary[] | undefined): number {
  return (refunds ?? [])
    .filter((r) => String(r.status ?? "") === "pending")
    .reduce((sum, r) => sum + parseRefundAmount(r.amount), 0);
}
