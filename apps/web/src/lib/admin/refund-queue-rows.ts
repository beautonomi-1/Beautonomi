import { parseRefundAmount, type BookingRefundSummary } from "@/lib/admin/booking-refund-context";
import type { BookingRefundCoverage } from "@/lib/admin/booking-refund-coverage";
import {
  computeDisplayRemaining,
  deriveQueueReason,
  NEEDS_ACTION_REASONS,
  queueReasonLabel,
  type QueueReason,
} from "@/lib/admin/refund-queue-reason";
import {
  aggregateTenderLabel,
  chargeTypeLabel,
  type BookingPaymentTender,
} from "@/lib/admin/refund-tender-labels";
import type { RefundListRow } from "@/lib/admin/refund-list-normalize";
import { enrichRefundListRow, type EnrichedRefundListRow } from "@/lib/admin/refund-list-normalize";

export type RefundQueueCapture = {
  id: string;
  transaction_type?: string | null;
  amount?: number | string | null;
  refund_amount?: number | string | null;
  status?: string;
  metadata?: Record<string, unknown> | null;
  remaining_refundable: number;
  charge_label: string;
  additional_charge_description?: string | null;
};

export type RefundQueueRow = {
  key: string;
  source: "gateway_capture" | "booking_tender";
  booking_id: string | null;
  booking: unknown;
  tender_label: string;
  collected: number;
  refunded: number;
  remaining_refundable: number;
  reserved: number;
  queue_reason: QueueReason;
  queue_reason_detail: string | null;
  queue_reason_label: string;
  needs_action: boolean;
  is_processable: boolean;
  captures: RefundQueueCapture[];
  /** Primary row for gateway POST /api/admin/refunds/[id] */
  primary_transaction_id: string | null;
  additional_charge_description?: string | null;
  enriched?: EnrichedRefundListRow;
};

export type RefundQueueContext = {
  disputesByBookingId: Set<string>;
  ticketsByBookingId: Set<string>;
  coverageByBookingId: Map<string, BookingRefundCoverage>;
  additionalChargesById: Map<string, { description?: string | null }>;
  bookingPaymentsByBookingId: Map<string, BookingPaymentTender[]>;
};

function bookingIdFromRow(row: RefundListRow): string | null {
  const b = row.booking as { id?: string } | null | undefined;
  return row.booking_id ?? b?.id ?? null;
}

function bookingCollectedFromPayments(payments: BookingPaymentTender[]): number {
  return payments.reduce((sum, p) => sum + parseRefundAmount(p.amount), 0);
}

function bookingRefundedTotal(booking: unknown): number {
  if (!booking || typeof booking !== "object") return 0;
  return parseRefundAmount((booking as { total_refunded?: unknown }).total_refunded);
}

function bookingCollectedTotal(booking: unknown, payments: BookingPaymentTender[]): number {
  if (!booking || typeof booking !== "object") return bookingCollectedFromPayments(payments);
  const b = booking as {
    total_paid?: unknown;
    wallet_amount?: unknown;
    gift_card_amount?: unknown;
  };
  const fromBooking = Math.max(
    parseRefundAmount(b.total_paid),
    parseRefundAmount(b.wallet_amount) + parseRefundAmount(b.gift_card_amount),
  );
  return Math.max(fromBooking, bookingCollectedFromPayments(payments));
}

export function buildRefundQueueRows(
  captureRows: RefundListRow[],
  ctx: RefundQueueContext,
): RefundQueueRow[] {
  const byBooking = new Map<string, EnrichedRefundListRow[]>();

  for (const row of captureRows) {
    const enriched = enrichRefundListRow(
      row,
      row.booking_refunds,
      undefined,
    );
    const bookingId = bookingIdFromRow(row);
    if (!bookingId) {
      continue;
    }
    const list = byBooking.get(bookingId) ?? [];
    list.push(enriched);
    byBooking.set(bookingId, list);
  }

  const queueRows: RefundQueueRow[] = [];

  for (const [bookingId, enrichedRows] of byBooking) {
    const sample = enrichedRows[0]!;
    const coverage = ctx.coverageByBookingId.get(bookingId);
    const payments = ctx.bookingPaymentsByBookingId.get(bookingId) ?? [];
    const hasGatewayCapture = enrichedRows.length > 0;

    const captures: RefundQueueCapture[] = enrichedRows.map((r) => {
      const chargeId =
        r.metadata && typeof r.metadata === "object"
          ? String((r.metadata as { additional_charge_id?: string }).additional_charge_id ?? "")
          : "";
      const addl = chargeId ? ctx.additionalChargesById.get(chargeId) : undefined;
      return {
        id: r.id,
        transaction_type: r.transaction_type,
        amount: r.amount,
        refund_amount: r.refund_amount,
        status: r.status,
        metadata: r.metadata,
        remaining_refundable: r.remaining_refundable,
        charge_label: chargeTypeLabel(r),
        additional_charge_description: addl?.description ?? null,
      };
    });

    const collectedFromCaptures = captures.reduce(
      (sum, c) => sum + parseRefundAmount(c.amount),
      0,
    );
    const refundedFromCaptures = captures.reduce(
      (sum, c) =>
        sum +
        Math.max(parseRefundAmount(c.refund_amount), parseRefundAmount(c.amount) - c.remaining_refundable),
      0,
    );

    let collected = collectedFromCaptures;
    let refunded = Math.max(bookingRefundedTotal(sample.booking), refundedFromCaptures);
    let remaining = captures.reduce((sum, c) => sum + c.remaining_refundable, 0);
    let source: RefundQueueRow["source"] = "gateway_capture";
    let primaryTxnId = captures.find((c) => c.remaining_refundable > 0)?.id ?? captures[0]?.id ?? null;

    if (collectedFromCaptures <= 0 && payments.length > 0) {
      source = "booking_tender";
      collected = bookingCollectedTotal(sample.booking, payments);
      refunded = bookingRefundedTotal(sample.booking);
      remaining = Math.max(0, Math.round((collected - refunded) * 100) / 100);
      primaryTxnId = null;
    } else if (payments.length > 0) {
      const tenderCollected = bookingCollectedTotal(sample.booking, payments);
      if (tenderCollected > collectedFromCaptures + 0.01) {
        collected = tenderCollected;
        remaining = Math.max(
          0,
          Math.round((collected - refunded) * 100) / 100,
        );
      }
    }

    const retainedFee = coverage?.retainedFeeTotal ?? 0;
    const giftVoid = coverage?.giftCardVoidedTotal ?? 0;
    const reserved = coverage?.reservedPendingTotal ?? 0;

    const derived = deriveQueueReason({
      bookingStatus: (sample.booking as { status?: string })?.status,
      paymentStatus: (sample.booking as { payment_status?: string })?.payment_status,
      remainingRefundable: remaining,
      retainedFeeTotal: retainedFee,
      giftCardVoidedTotal: giftVoid,
      reservedPendingTotal: reserved,
      bookingRefunds: sample.booking_refunds,
      hasOpenDispute: ctx.disputesByBookingId.has(bookingId),
      hasRefundSupportTicket: ctx.ticketsByBookingId.has(bookingId),
      hasGatewayCapture,
    });

    const displayRemaining = computeDisplayRemaining({
      remainingRefundable: remaining,
      retainedFeeTotal: retainedFee,
      giftCardVoidedTotal: giftVoid,
      reservedPendingTotal: reserved,
      queueReason: derived.queue_reason,
    });

    const isProcessable =
      displayRemaining > 0 &&
      (source === "booking_tender"
        ? !hasGatewayCapture || enrichedRows.every((r) => r.remaining_refundable <= 0)
        : enrichedRows.some((r) => r.remaining_refundable > 0)) &&
      derived.queue_reason !== "kept_per_policy" &&
      derived.queue_reason !== "gift_card_voided" &&
      derived.queue_reason !== "awaiting_cash_confirmation" &&
      derived.queue_reason !== "no_refund_due";

    const addlDesc = captures.find((c) => c.additional_charge_description)?.additional_charge_description;

    queueRows.push({
      key: source === "booking_tender" ? `booking:${bookingId}` : `txn:${primaryTxnId ?? bookingId}`,
      source,
      booking_id: bookingId,
      booking: sample.booking,
      tender_label:
        source === "booking_tender"
          ? aggregateTenderLabel(payments)
          : aggregateTenderLabel(
              payments.length > 0 ? payments : [{ payment_provider: enrichedRows[0]?.provider }],
            ),
      collected,
      refunded,
      remaining_refundable: displayRemaining,
      reserved,
      queue_reason: derived.queue_reason,
      queue_reason_detail: derived.queue_reason_detail,
      queue_reason_label: queueReasonLabel(derived.queue_reason),
      needs_action: NEEDS_ACTION_REASONS.has(derived.queue_reason),
      is_processable: isProcessable,
      captures,
      primary_transaction_id: primaryTxnId,
      additional_charge_description: addlDesc ?? null,
      enriched: enrichedRows[0],
    });
  }

  return queueRows.sort((a, b) => {
    const ta = a.enriched?.created_at ? new Date(String(a.enriched.created_at)).getTime() : 0;
    const tb = b.enriched?.created_at ? new Date(String(b.enriched.created_at)).getTime() : 0;
    return tb - ta;
  });
}

export function countRefundsNeedingReviewFromQueue(rows: RefundQueueRow[]): number {
  return rows.filter((r) => r.needs_action).length;
}
