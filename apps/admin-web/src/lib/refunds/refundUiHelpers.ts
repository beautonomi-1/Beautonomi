export const REFUND_REASON_PRESETS = [
  "Customer cancellation",
  "Provider cancellation",
  "Dispute resolution",
  "Duplicate charge",
  "Service not delivered",
  "Other",
] as const;

export type RefundReasonPreset = (typeof REFUND_REASON_PRESETS)[number];

export function parseRefundAmount(val: unknown): number {
  const n = parseFloat(String(val ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export function remainingRefundable(amount: unknown, refundAmount: unknown): number {
  const gross = parseRefundAmount(amount);
  const refunded = parseRefundAmount(refundAmount);
  return Math.max(0, Math.round((gross - refunded) * 100) / 100);
}

export function isProcessableRefundRow(row: {
  status?: string;
  booking?: unknown;
  is_processable?: boolean;
}): boolean {
  if (typeof row.is_processable === "boolean") return row.is_processable;
  if (row.booking == null) return false;
  const status = String(row.status ?? "");
  return status === "success" || status === "partially_refunded";
}

/**
 * Mirrors POST /api/admin/bookings/[id]/refund available balance logic.
 */
export function computeBookingAvailableRefund(booking: {
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_amount?: number | null;
  gift_card_amount?: number | null;
}): number {
  const totalCollected = Math.max(
    Number(booking.total_paid ?? 0),
    Number(booking.wallet_amount ?? 0) + Number(booking.gift_card_amount ?? 0),
  );
  const alreadyRefunded = Number(booking.total_refunded ?? 0);
  return Math.max(0, Math.round((totalCollected - alreadyRefunded) * 100) / 100);
}

export function canShowBookingRefund(booking: {
  payment_status?: string | null;
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_amount?: number | null;
  gift_card_amount?: number | null;
}): boolean {
  const ps = String(booking.payment_status ?? "");
  if (ps !== "paid" && ps !== "partially_paid") return false;
  return computeBookingAvailableRefund(booking) > 0;
}

type OrphanLabel = { label: string; href?: string };

export function orphanPaymentLabel(metadata: unknown): OrphanLabel | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const kind = typeof m.kind === "string" ? m.kind : null;
  if (!kind) return null;

  if (kind === "gift_card_order" && typeof m.gift_card_order_id === "string") {
    return {
      label: "Gift card order",
      href: `/admin/gift-cards/${encodeURIComponent(m.gift_card_order_id)}`,
    };
  }
  if (kind === "membership_order" && typeof m.membership_order_id === "string") {
    return { label: "Membership order" };
  }
  if (kind === "provider_subscription_order") {
    return { label: "Provider subscription order" };
  }
  if (kind === "subscription_authorization") {
    return { label: "Subscription authorization" };
  }
  if (kind === "ads_budget_order") {
    return { label: "Ads budget order" };
  }
  return { label: kind.replace(/_/g, " ") };
}

export function normalizeRefundReason(
  preset: RefundReasonPreset | "",
  otherText: string,
): string {
  if (!preset) return otherText.trim();
  if (preset === "Other") return otherText.trim();
  return preset;
}

export function isRefundReasonValid(
  preset: RefundReasonPreset | "",
  otherText: string,
): boolean {
  const reason = normalizeRefundReason(preset, otherText);
  return reason.length > 0;
}
