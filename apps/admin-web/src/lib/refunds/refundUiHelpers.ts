export const REFUND_REASON_PRESETS = [
  "Customer cancellation",
  "Provider cancellation",
  "Dispute resolution",
  "Duplicate charge",
  "Service not delivered",
  "Other",
] as const;

export type RefundReasonPreset = (typeof REFUND_REASON_PRESETS)[number];

export type RefundState =
  | "not_refunded"
  | "partially_refunded"
  | "fully_refunded"
  | "credited_elsewhere"
  | "not_applicable";

export type CreditedVia =
  | "admin_refunds_page"
  | "cancellation"
  | "provider"
  | "dispute"
  | null;

export type DerivedRefundRowState = {
  label: string;
  badgeClass: string;
  actionLabel: string | null;
  canProcess: boolean;
  reason: string | null;
  creditedVia: CreditedVia;
  payoutLabel: string | null;
  paymentCaptureStatus: string;
};

const REFUND_STATE_BADGE: Record<RefundState, string> = {
  not_refunded: "bg-amber-100 text-amber-800",
  partially_refunded: "bg-indigo-100 text-indigo-800",
  fully_refunded: "bg-blue-100 text-blue-800",
  credited_elsewhere: "bg-purple-100 text-purple-800",
  not_applicable: "bg-gray-100 text-gray-600",
};

const REFUND_STATE_LABEL: Record<RefundState, string> = {
  not_refunded: "Not refunded",
  partially_refunded: "Partially refunded",
  fully_refunded: "Fully refunded",
  credited_elsewhere: "Credited elsewhere",
  not_applicable: "Not refundable here",
};

const CREDITED_VIA_LABEL: Record<Exclude<CreditedVia, null>, string> = {
  admin_refunds_page: "Admin refunds page",
  cancellation: "Cancellation policy",
  provider: "Provider refund",
  dispute: "Dispute resolution",
};

export function deriveRefundRowState(row: {
  status?: string;
  booking?: unknown;
  is_processable?: boolean;
  refund_state?: RefundState;
  effective_reason?: string | null;
  refund_reason?: string | null;
  credited_via?: CreditedVia;
  effective_refunded_total?: number;
  refunded_at?: string | null;
  wallet_credited_at?: string | null;
}): DerivedRefundRowState {
  const refundState = (row.refund_state ?? "not_refunded") as RefundState;
  const canProcess =
    typeof row.is_processable === "boolean"
      ? row.is_processable
      : isProcessableRefundRow({
          status: row.status,
          booking: row.booking,
          is_processable: row.is_processable,
        });
  const reason =
    row.effective_reason ??
    (row.refund_reason ? String(row.refund_reason) : null);
  const creditedVia = row.credited_via ?? null;
  const effectiveRefunded = parseRefundAmount(row.effective_refunded_total);
  const creditedAt = row.wallet_credited_at ?? row.refunded_at ?? null;
  const payoutLabel =
    effectiveRefunded > 0
      ? creditedAt
        ? `Wallet credited · ${new Date(String(creditedAt)).toLocaleDateString()}`
        : "Wallet credited"
      : null;

  return {
    label: REFUND_STATE_LABEL[refundState] ?? refundState,
    badgeClass: REFUND_STATE_BADGE[refundState] ?? "bg-gray-100 text-gray-600",
    actionLabel: canProcess ? "Credit wallet" : null,
    canProcess,
    reason,
    creditedVia,
    payoutLabel,
    paymentCaptureStatus: String(row.status ?? "pending"),
  };
}

export function creditedViaLabel(via: CreditedVia): string | null {
  if (!via) return null;
  return CREDITED_VIA_LABEL[via] ?? via;
}

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
