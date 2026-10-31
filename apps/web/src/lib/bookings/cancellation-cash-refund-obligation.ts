import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingPaymentForRefundCap } from "@/lib/bookings/booking-refund-limits";
import { fetchBookingPaymentsForRefundCap } from "@/lib/bookings/booking-refund-limits";
import { isInPersonCollected } from "@/lib/bookings/payment-collected-classifier";
import { isPlatformCollected } from "@/lib/bookings/payment-collected-classifier";
import {
  cashRefundConfirmationDeadline,
  finalizeCashRefund,
  notifyCustomerCashRefundConfirmation,
} from "@/lib/bookings/cash-refund-confirmation";
import { roundCurrency2 } from "@/lib/bookings/refund-processing";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";

/** Notes marker for auto-created cancellation cash obligations (backfill + cron notify). */
export const CANCELLATION_CASH_OBLIGATION_NOTE =
  "Cancellation — in-person refund owed";

export function isTerminalMachinePayment(
  payment: Pick<BookingPaymentForRefundCap, "payment_provider">,
): boolean {
  const provider = String(payment.payment_provider ?? "").toLowerCase();
  return provider === "paycloud" || provider === "yoco";
}

/** In-person collected on this booking excluding PayCloud / Yoco (cash-confirmation path). */
export function isNonTerminalInPersonPayment(p: BookingPaymentForRefundCap): boolean {
  if (p.status !== "completed" && p.status !== "partially_refunded") return false;
  if (isTerminalMachinePayment(p)) return false;
  return isInPersonCollected(p);
}

export function sumNonTerminalInPersonCollected(
  payments: BookingPaymentForRefundCap[],
): number {
  return roundCurrency2(
    payments
      .filter(isNonTerminalInPersonPayment)
      .reduce((sum, p) => sum + Math.max(0, Number(p.amount ?? 0)), 0),
  );
}

export function sumPlatformCollectedFromPayments(
  payments: BookingPaymentForRefundCap[],
): number {
  return roundCurrency2(
    payments
      .filter((p) => isPlatformCollected(p))
      .reduce((sum, p) => sum + Math.max(0, Number(p.amount ?? 0)), 0),
  );
}

type CashRefundRow = {
  amount?: number | string | null;
  refund_method?: string | null;
  status?: string | null;
  customer_disputed_at?: string | null;
  notes?: string | null;
};

export function sumCashRefundRows(
  rows: CashRefundRow[],
  statuses: Array<"pending" | "completed">,
): number {
  const allowed = new Set(statuses);
  return roundCurrency2(
    rows
      .filter(
        (r) =>
          allowed.has(String(r.status ?? "") as "pending" | "completed") &&
          String(r.refund_method ?? "").toLowerCase() === "cash",
      )
      .reduce((sum, r) => sum + Math.max(0, Number(r.amount ?? 0)), 0),
  );
}

/** Matches admin close when store credit replaces pending cash (QA: do not reopen obligation). */
export const CASH_CLOSED_BY_STORE_CREDIT_NOTE =
  "Closed — store credit issued by admin instead of in-person cash";

export function cashRefundClosedByStoreCreditSubstitute(r: CashRefundRow): boolean {
  return (
    String(r.status ?? "") === "failed" &&
    String(r.refund_method ?? "").toLowerCase() === "cash" &&
    !r.customer_disputed_at &&
    String(r.notes ?? "").includes(CASH_CLOSED_BY_STORE_CREDIT_NOTE)
  );
}

export function sumReservedAgainstCashObligation(rows: CashRefundRow[]): number {
  const pendingCompleted = sumCashRefundRows(rows, ["pending", "completed"]);
  const substituteClosed = roundCurrency2(
    rows
      .filter(cashRefundClosedByStoreCreditSubstitute)
      .reduce((sum, r) => sum + Math.max(0, Number(r.amount ?? 0)), 0),
  );
  return roundCurrency2(pendingCompleted + substituteClosed);
}

export function bookingHasDisputedCashRefund(rows: CashRefundRow[]): boolean {
  return rows.some(
    (r) =>
      String(r.status ?? "") === "failed" &&
      String(r.refund_method ?? "").toLowerCase() === "cash" &&
      Boolean(r.customer_disputed_at),
  );
}

export function computeNonTerminalCashObligationAmount(
  payments: BookingPaymentForRefundCap[],
  refundRows: CashRefundRow[],
): number {
  if (bookingHasDisputedCashRefund(refundRows)) return 0;
  const collected = sumNonTerminalInPersonCollected(payments);
  const reserved = sumReservedAgainstCashObligation(refundRows);
  return roundCurrency2(Math.max(0, collected - reserved));
}

export type EnsureCancellationCashRefundResult = {
  inPersonCashRefundDue: number;
  created: boolean;
  refundId: string | null;
};

/**
 * Idempotent pending cash refund for cancelled / no-show in-person money (not PayCloud/Yoco).
 */
export async function ensureCancellationCashRefundObligation(
  supabase: SupabaseClient,
  params: {
    bookingId: string;
    tenantId?: string | null;
    providerId: string;
    customerId?: string | null;
    bookingNumber?: string | null;
    currency: string;
    cancelledBy: string;
    /** When false, only compute due amount (backfill guard). */
    insert?: boolean;
    createdBy?: string | null;
  },
): Promise<EnsureCancellationCashRefundResult> {
  const payments = await fetchBookingPaymentsForRefundCap(
    supabase,
    params.bookingId,
    params.tenantId,
  );
  const { data: refundRows } = await supabase
    .from("booking_refunds")
    .select(
      "id, amount, refund_method, status, customer_disputed_at, notes, customer_confirmation_required",
    )
    .eq("booking_id", params.bookingId);

  const rows = (refundRows ?? []) as CashRefundRow[];
  const amountDue = computeNonTerminalCashObligationAmount(payments, rows);
  if (amountDue <= 0.01) {
    return { inPersonCashRefundDue: 0, created: false, refundId: null };
  }

  if (params.insert === false) {
    return { inPersonCashRefundDue: amountDue, created: false, refundId: null };
  }

  const reason = `Booking ${params.cancelledBy} — return in-person payment`;
  const notes = CANCELLATION_CASH_OBLIGATION_NOTE;
  const requiresCustomerConfirmation = Boolean(params.customerId);

  const { data: inserted, error } = await supabase
    .from("booking_refunds")
    .insert({
      booking_id: params.bookingId,
      amount: amountDue,
      reason,
      refund_method: "cash",
      status: "pending",
      notes,
      created_by: params.createdBy ?? null,
      customer_confirmation_required: requiresCustomerConfirmation,
      confirmation_deadline_at: requiresCustomerConfirmation
        ? cashRefundConfirmationDeadline()
        : null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[ensureCancellationCashRefundObligation] insert failed:", error);
    return { inPersonCashRefundDue: amountDue, created: false, refundId: null };
  }

  const refundId = (inserted as { id: string }).id;

  if (!requiresCustomerConfirmation) {
    await finalizeCashRefund(supabase, refundId, params.bookingId, params.createdBy ?? null);
    return { inPersonCashRefundDue: amountDue, created: true, refundId };
  }

  const tenantRegion = params.tenantId
    ? await getTenantRegionConfig(params.tenantId)
    : null;
  const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
  const locale = getTenantLocaleTagFromRegionConfig(tenantRegion);
  const currency = params.currency || lastResortCurrency;
  const amountFormatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountDue);

  const { data: providerRow } = await supabase
    .from("providers")
    .select("business_name")
    .eq("id", params.providerId)
    .maybeSingle();
  const providerName =
    (providerRow as { business_name?: string } | null)?.business_name ?? "Your provider";
  const bookingRef =
    params.bookingNumber ?? params.bookingId.slice(0, 8).toUpperCase();

  try {
    await notifyCustomerCashRefundConfirmation({
      customerId: params.customerId!,
      bookingId: params.bookingId,
      bookingNumber: String(bookingRef),
      refundId,
      amountFormatted,
      providerName,
      tenantId: params.tenantId ?? null,
    });
  } catch (notifErr) {
    console.warn("[ensureCancellationCashRefundObligation] notify failed:", notifErr);
  }

  return { inPersonCashRefundDue: amountDue, created: true, refundId };
}
