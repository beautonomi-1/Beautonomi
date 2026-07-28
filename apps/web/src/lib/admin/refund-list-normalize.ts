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
};

export type EnrichedRefundListRow = RefundListRow & {
  remaining_refundable: number;
  payout_method: "wallet";
  is_processable: boolean;
};

function unwrapEmbed<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

function parseAmount(val: unknown): number {
  const n = parseFloat(String(val ?? "0"));
  return Number.isFinite(n) ? n : 0;
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
  const gross = parseAmount(amount);
  const refunded = parseAmount(refundAmount);
  return Math.max(0, Math.round((gross - refunded) * 100) / 100);
}

export function isProcessableRefundListRow(row: RefundListRow, remaining: number): boolean {
  if (row.booking == null) return false;
  const status = String(row.status ?? "");
  if (status !== "success" && status !== "partially_refunded") return false;
  return remaining > 0;
}

export function enrichRefundListRow(row: RefundListRow): EnrichedRefundListRow {
  const normalized = normalizeRefundListRowEmbeds(row);
  const remaining = remainingRefundableAmount(normalized.amount, normalized.refund_amount);
  return {
    ...normalized,
    remaining_refundable: remaining,
    payout_method: "wallet",
    is_processable: isProcessableRefundListRow(normalized, remaining),
  };
}

export function countActionableRefundable(rows: EnrichedRefundListRow[]): number {
  return rows.filter((r) => r.is_processable).length;
}
