export type BookingRefundSummary = {
  id: string;
  booking_id: string;
  amount: number | string | null;
  reason: string;
  refund_method?: string | null;
  status?: string | null;
  notes?: string | null;
  created_at?: string | null;
  created_by?: string | null;
};

export type CreditedVia =
  | "admin_refunds_page"
  | "cancellation"
  | "provider"
  | "dispute"
  | null;

export type RefundState =
  | "not_refunded"
  | "partially_refunded"
  | "fully_refunded"
  | "credited_elsewhere"
  | "not_applicable";

export function parseRefundAmount(val: unknown): number {
  const n = parseFloat(String(val ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/** Only the amount, method and status are read, so callers may pass a narrower row. */
export type RefundAmountRow = Partial<
  Pick<BookingRefundSummary, "amount" | "refund_method" | "status">
>;

export function sumCompletedStoreCreditRefunds(
  refunds: RefundAmountRow[] | undefined | null,
): number {
  if (!refunds?.length) return 0;
  return refunds
    .filter(
      (r) =>
        String(r.status ?? "") === "completed" &&
        String(r.refund_method ?? "store_credit") === "store_credit",
    )
    .reduce((sum, r) => sum + parseRefundAmount(r.amount), 0);
}

export function latestCompletedStoreCreditRefund(
  refunds: BookingRefundSummary[] | undefined | null,
): BookingRefundSummary | null {
  if (!refunds?.length) return null;
  const completed = refunds
    .filter(
      (r) =>
        String(r.status ?? "") === "completed" &&
        String(r.refund_method ?? "store_credit") === "store_credit",
    )
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  return completed[0] ?? null;
}

export function inferCreditedVia(
  txnRefundedBy: unknown,
  latestRefund: BookingRefundSummary | null,
): CreditedVia {
  if (txnRefundedBy) return "admin_refunds_page";
  if (!latestRefund) return null;

  const reason = String(latestRefund.reason ?? "").toLowerCase();
  const notes = String(latestRefund.notes ?? "").toLowerCase();
  const combined = `${reason} ${notes}`;

  if (combined.includes("cancellation") || combined.includes("cancelled")) {
    return "cancellation";
  }
  if (combined.includes("dispute")) {
    return "dispute";
  }
  if (latestRefund.created_by) {
    return "provider";
  }
  return null;
}

export function computeRefundState(args: {
  hasBooking: boolean;
  chargeAmount: number;
  txnRefundedTotal: number;
  walletCreditedTotal: number;
  txnStatus?: string;
}): RefundState {
  const { hasBooking, chargeAmount, txnRefundedTotal, walletCreditedTotal, txnStatus } =
    args;

  if (!hasBooking) return "not_applicable";

  const effectiveRefunded = Math.max(txnRefundedTotal, walletCreditedTotal);
  const remaining = Math.max(
    0,
    Math.round((chargeAmount - effectiveRefunded) * 100) / 100,
  );

  if (
    walletCreditedTotal > txnRefundedTotal + 0.001 &&
    walletCreditedTotal > 0 &&
    txnRefundedTotal <= 0
  ) {
    return remaining <= 0 ? "credited_elsewhere" : "partially_refunded";
  }

  if (remaining <= 0 && effectiveRefunded > 0) {
    return "fully_refunded";
  }
  if (effectiveRefunded > 0 && remaining > 0) {
    return "partially_refunded";
  }
  if (
    txnStatus === "refunded" ||
    txnStatus === "partially_refunded" ||
    txnRefundedTotal > 0
  ) {
    return remaining <= 0 ? "fully_refunded" : "partially_refunded";
  }
  return "not_refunded";
}

export function computeEffectiveRemainingRefundable(args: {
  chargeAmount: number;
  txnRefundedTotal: number;
  walletCreditedTotal: number;
}): number {
  const effectiveRefunded = Math.min(
    args.chargeAmount,
    Math.max(args.txnRefundedTotal, args.walletCreditedTotal),
  );
  return Math.max(
    0,
    Math.round((args.chargeAmount - effectiveRefunded) * 100) / 100,
  );
}

export type ChargeAllocationInput = {
  id: string;
  transaction_type?: string | null;
  amount?: unknown;
  refund_amount?: unknown;
  created_at?: string | null;
};

export type ChargeAllocationResult = {
  walletApplied: number;
  effectiveRefunded: number;
  remainingRefundable: number;
};

/**
 * Apply booking-level wallet credits across charge rows in order: primary
 * `charge` first, then `additional_charge` rows by payment date.
 */
export function allocateBookingWalletAcrossCharges(
  charges: ChargeAllocationInput[],
  bookingWalletTotal: number,
): Map<string, ChargeAllocationResult> {
  const result = new Map<string, ChargeAllocationResult>();
  if (charges.length === 0) return result;

  const sorted = [...charges].sort((a, b) => {
    const aPrimary = a.transaction_type === "charge" ? 0 : 1;
    const bPrimary = b.transaction_type === "charge" ? 0 : 1;
    if (aPrimary !== bPrimary) return aPrimary - bPrimary;
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });

  let walletRemaining = Math.max(0, bookingWalletTotal);

  for (const charge of sorted) {
    const chargeAmount = parseRefundAmount(charge.amount);
    const txnRefundedTotal = parseRefundAmount(charge.refund_amount);
    const walletApplied = Math.min(chargeAmount, walletRemaining);
    walletRemaining = Math.max(
      0,
      Math.round((walletRemaining - walletApplied) * 100) / 100,
    );
    const effectiveRefunded = Math.min(
      chargeAmount,
      Math.max(txnRefundedTotal, walletApplied),
    );
    const remainingRefundable = Math.max(
      0,
      Math.round((chargeAmount - effectiveRefunded) * 100) / 100,
    );
    result.set(charge.id, {
      walletApplied,
      effectiveRefunded,
      remainingRefundable,
    });
  }

  return result;
}

export function bookingWalletExposure(
  refunds: BookingRefundSummary[] | undefined | null,
  bookingTotalRefunded: number,
): number {
  return Math.max(sumCompletedStoreCreditRefunds(refunds), bookingTotalRefunded);
}
