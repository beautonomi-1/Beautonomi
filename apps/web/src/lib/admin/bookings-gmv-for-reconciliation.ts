import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/admin/finance-ledger-tenant";
import { subtractMoney, addMoney, roundCurrency } from "@beautonomi/utils";

export type BookingsGmvReconciliationResult = {
  /** Sum of total_amount for bookings that collected money, including later refunds. */
  grossBookingsGmv: number;
  /** Walk-in additional charges included in total_amount but excluded from ledger GMV. */
  walkInAddOnDeduction: number;
  /** grossBookingsGmv − walkInAddOnDeduction — comparable to ledger service_collected_gross. */
  alignedBookingsGmv: number;
};

/** Bookings that collected money, including ones later refunded. Ledger GMV is gross. */
export const ALIGNED_BOOKINGS_PAYMENT_STATUSES = [
  "paid",
  "partially_paid",
  "refunded",
  "partially_refunded",
] as const;

export function countsTowardAlignedBookingsGmv(row: { payment_status?: string | null }): boolean {
  return (ALIGNED_BOOKINGS_PAYMENT_STATUSES as readonly string[]).includes(String(row.payment_status ?? ""));
}

export function sumAlignedBookingsGmv(
  rows: Array<{ total_amount?: number | null; payment_status?: string | null }>,
  walkInDeduction = 0,
): BookingsGmvReconciliationResult {
  const grossBookingsGmv = rows
    .filter(countsTowardAlignedBookingsGmv)
    .reduce((s, row) => addMoney(s, Number(row.total_amount ?? 0)), 0);
  const deduction = Math.max(0, walkInDeduction);
  return {
    grossBookingsGmv: roundCurrency(grossBookingsGmv),
    walkInAddOnDeduction: roundCurrency(deduction),
    alignedBookingsGmv: roundCurrency(Math.max(0, subtractMoney(grossBookingsGmv, deduction))),
  };
}

/**
 * Bookings-side GMV aligned with ledger `service_collected_gross`:
 * every booking that collected money, including later refunds. Walk-in add-ons subtracted.
 */
export async function computeAlignedBookingsGmv(
  supabase: SupabaseClient,
  tenantId: string,
  range: { start?: string | null; end?: string | null },
  ledgerWalkInCharges = 0,
): Promise<BookingsGmvReconciliationResult> {
  let bookingsQuery = supabase
    .from("bookings")
    .select("total_amount")
    .eq("tenant_id", tenantId)
    .in("payment_status", [...ALIGNED_BOOKINGS_PAYMENT_STATUSES]);

  if (range.start) bookingsQuery = bookingsQuery.gte("created_at", range.start);
  if (range.end) bookingsQuery = bookingsQuery.lte("created_at", range.end);

  bookingsQuery = bookingsQuery.order("id", { ascending: true });

  let bookingRows: { total_amount?: number }[] = [];
  try {
    const { rows } = await fetchAllPages<{ total_amount?: number }>(bookingsQuery);
    bookingRows = rows;
  } catch (bookingErr) {
    const message = bookingErr instanceof Error ? bookingErr.message : String(bookingErr);
    console.warn("computeAlignedBookingsGmv bookings query failed:", message);
    return { grossBookingsGmv: 0, walkInAddOnDeduction: 0, alignedBookingsGmv: 0 };
  }

  const grossBookingsGmv = sumAlignedBookingsGmv(bookingRows, 0).grossBookingsGmv;

  let walkInAddOnDeduction = Math.max(0, ledgerWalkInCharges);

  if (walkInAddOnDeduction <= 0) {
    let acQuery = supabase
      .from("booking_payments")
      .select("amount, payment_provider_data")
      .eq("tenant_id", tenantId)
      .in("status", ["completed", "partially_refunded"]);
    if (range.start) acQuery = acQuery.gte("created_at", range.start);
    if (range.end) acQuery = acQuery.lte("created_at", range.end);

    acQuery = acQuery.order("id", { ascending: true });
    const { rows: walkInPayments } = await fetchAllPages<{
      amount?: number;
      payment_provider_data?: Record<string, unknown>;
    }>(acQuery);
    walkInAddOnDeduction = walkInPayments.reduce((s, row) => {
      const pd = (row as { payment_provider_data?: Record<string, unknown> }).payment_provider_data;
      const isWalkIn =
        pd &&
        typeof pd === "object" &&
        pd.source === "walk_in" &&
        typeof pd.additional_charge_id === "string" &&
        pd.additional_charge_id.length > 0;
      if (!isWalkIn) return s;
      return s + Number((row as { amount?: number }).amount ?? 0);
    }, 0);
  }

  const alignedBookingsGmv = Math.max(0, grossBookingsGmv - walkInAddOnDeduction);

  return {
    grossBookingsGmv: Math.round(grossBookingsGmv * 100) / 100,
    walkInAddOnDeduction: Math.round(walkInAddOnDeduction * 100) / 100,
    alignedBookingsGmv: Math.round(alignedBookingsGmv * 100) / 100,
  };
}
