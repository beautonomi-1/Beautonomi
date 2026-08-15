import {
  allocateBookingWalletAcrossCharges,
  bookingWalletExposure,
  computeEffectiveRemainingRefundable,
  computeRefundState,
  inferCreditedVia,
  latestCompletedStoreCreditRefund,
  parseRefundAmount,
  type BookingRefundSummary,
  type CreditedVia,
  type ChargeAllocationInput,
  type RefundState,
} from "./booking-refund-context";

/** Merged refund list row (PostgREST shapes vary for embeds). */
export type RefundListRow = {
  id: string;
  booking_id?: string | null;
  transaction_type?: string;
  amount?: number | string | null;
  refund_amount?: string | number | null;
  refund_reference?: string | null;
  refund_reason?: string | null;
  refunded_at?: string | null;
  refunded_by?: string | null;
  status?: string;
  created_at?: string;
  provider?: string | null;
  metadata?: Record<string, unknown> | null;
  booking?: unknown;
  refunded_by_user?: unknown;
  booking_refunds?: BookingRefundSummary[];
};

export type EnrichedRefundListRow = RefundListRow & {
  remaining_refundable: number;
  payout_method: "wallet" | null;
  is_processable: boolean;
  refund_state: RefundState;
  wallet_credited_total: number;
  txn_refunded_total: number;
  effective_reason: string | null;
  credited_via: CreditedVia;
  effective_refunded_total: number;
  wallet_credited_at: string | null;
};

function unwrapEmbed<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

/** PostgREST sometimes returns FK embeds as one object or an array — normalize for admin UI. */
export function normalizeRefundListRowEmbeds(row: RefundListRow): RefundListRow {
  const booking = row.booking;
  if (!booking || typeof booking !== "object") return row;
  const b = booking as Record<string, unknown>;
  const customer = unwrapEmbed(
    b.customer as { id?: string; full_name?: string | null; email?: string | null } | undefined,
  );
  const provider = unwrapEmbed(
    b.provider as { id?: string; business_name?: string | null } | undefined,
  );
  return {
    ...row,
    booking: { ...b, customer, provider },
  };
}

export function remainingRefundableAmount(
  amount: unknown,
  refundAmount: unknown,
): number {
  const gross = parseRefundAmount(amount);
  const refunded = parseRefundAmount(refundAmount);
  return Math.max(0, Math.round((gross - refunded) * 100) / 100);
}

export function isProcessableRefundListRow(
  row: RefundListRow,
  remaining: number,
): boolean {
  if (row.booking == null) return false;
  const status = String(row.status ?? "");
  if (status !== "success" && status !== "partially_refunded") return false;
  return remaining > 0;
}

function bookingTotalRefunded(booking: unknown): number {
  if (!booking || typeof booking !== "object") return 0;
  return parseRefundAmount((booking as { total_refunded?: unknown }).total_refunded);
}

function resolveBookingId(row: RefundListRow): string | null {
  const booking = row.booking as { id?: string } | null | undefined;
  return row.booking_id ?? booking?.id ?? null;
}

export function buildWalletAllocationsForRows(
  rows: RefundListRow[],
): Map<string, number> {
  const byBooking = new Map<string, RefundListRow[]>();
  for (const row of rows) {
    const bookingId = resolveBookingId(row);
    if (!bookingId || row.booking == null) continue;
    const list = byBooking.get(bookingId) ?? [];
    list.push(row);
    byBooking.set(bookingId, list);
  }

  const walletAppliedByTxnId = new Map<string, number>();
  for (const bookingRows of byBooking.values()) {
    const sample = bookingRows[0];
    const refunds = sample.booking_refunds ?? [];
    const exposure = bookingWalletExposure(refunds, bookingTotalRefunded(sample.booking));
    const chargeInputs: ChargeAllocationInput[] = bookingRows.map((row) => ({
      id: row.id,
      transaction_type: row.transaction_type,
      amount: row.amount,
      refund_amount: row.refund_amount,
      created_at: row.created_at,
    }));
    const allocations = allocateBookingWalletAcrossCharges(chargeInputs, exposure);
    for (const [txnId, allocation] of allocations) {
      walletAppliedByTxnId.set(txnId, allocation.walletApplied);
    }
  }

  return walletAppliedByTxnId;
}

export function enrichRefundListRow(
  row: RefundListRow,
  bookingRefunds?: BookingRefundSummary[],
  walletAppliedToCharge?: number,
): EnrichedRefundListRow {
  const normalized = normalizeRefundListRowEmbeds(row);
  const refunds = bookingRefunds ?? normalized.booking_refunds ?? [];
  const chargeAmount = parseRefundAmount(normalized.amount);
  const txnRefundedTotal = parseRefundAmount(normalized.refund_amount);
  const bookingWalletTotal = bookingWalletExposure(
    refunds,
    bookingTotalRefunded(normalized.booking),
  );
  const walletApplied =
    walletAppliedToCharge ??
    Math.min(chargeAmount, bookingWalletTotal);
  const latestRefund = latestCompletedStoreCreditRefund(refunds);
  const effectiveRefundedTotal = Math.min(
    chargeAmount,
    Math.max(txnRefundedTotal, walletApplied),
  );
  const remaining = computeEffectiveRemainingRefundable({
    chargeAmount,
    txnRefundedTotal,
    walletCreditedTotal: walletApplied,
  });
  const hasBooking = normalized.booking != null;
  const refund_state = computeRefundState({
    hasBooking,
    chargeAmount,
    txnRefundedTotal,
    walletCreditedTotal: walletApplied,
    txnStatus: normalized.status,
  });
  const credited_via = inferCreditedVia(normalized.refunded_by, latestRefund);
  const effective_reason =
    (normalized.refund_reason ? String(normalized.refund_reason) : null) ??
    latestRefund?.reason ??
    null;
  const is_processable = isProcessableRefundListRow(normalized, remaining);
  const wallet_credited_at =
    normalized.refunded_at ??
    latestRefund?.created_at ??
    null;

  return {
    ...normalized,
    booking_refunds: refunds,
    remaining_refundable: remaining,
    payout_method: effectiveRefundedTotal > 0 ? "wallet" : null,
    is_processable,
    refund_state,
    wallet_credited_total: bookingWalletTotal,
    txn_refunded_total: txnRefundedTotal,
    effective_reason: effective_reason,
    credited_via,
    effective_refunded_total: effectiveRefundedTotal,
    wallet_credited_at: wallet_credited_at ? String(wallet_credited_at) : null,
  };
}

export function enrichRefundListRows(rows: RefundListRow[]): EnrichedRefundListRow[] {
  const walletApplied = buildWalletAllocationsForRows(rows);
  return rows.map((row) =>
    enrichRefundListRow(row, row.booking_refunds, walletApplied.get(row.id)),
  );
}

export function countActionableRefundable(rows: EnrichedRefundListRow[]): number {
  return rows.filter((r) => r.is_processable).length;
}

export function attachBookingRefundsToRows(
  rows: RefundListRow[],
  refundsByBookingId: Map<string, BookingRefundSummary[]>,
): RefundListRow[] {
  return rows.map((row) => {
    const bookingId = resolveBookingId(row);
    if (!bookingId) return row;
    const booking_refunds = refundsByBookingId.get(bookingId) ?? [];
    return { ...row, booking_refunds };
  });
}
