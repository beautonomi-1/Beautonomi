import type { SupabaseClient } from "@supabase/supabase-js";

export type BookingsGmvReconciliationResult = {
  /** Sum of total_amount for paid/partially_paid confirmed/completed bookings. */
  grossBookingsGmv: number;
  /** Walk-in additional charges included in total_amount but excluded from ledger GMV. */
  walkInAddOnDeduction: number;
  /** grossBookingsGmv − walkInAddOnDeduction — comparable to ledger service_collected_gross. */
  alignedBookingsGmv: number;
};

/**
 * Bookings-side GMV aligned with ledger `service_collected_gross`:
 * paid bookings only, walk-in add-ons subtracted (ledger excludes them).
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
    .in("status", ["confirmed", "completed"])
    .in("payment_status", ["paid", "partially_paid"]);

  if (range.start) bookingsQuery = bookingsQuery.gte("created_at", range.start);
  if (range.end) bookingsQuery = bookingsQuery.lte("created_at", range.end);

  const { data: bookingRows, error: bookingErr } = await bookingsQuery;
  if (bookingErr) {
    console.warn("computeAlignedBookingsGmv bookings query failed:", bookingErr.message);
    return { grossBookingsGmv: 0, walkInAddOnDeduction: 0, alignedBookingsGmv: 0 };
  }

  const grossBookingsGmv = (bookingRows ?? []).reduce(
    (s, row) => s + Number((row as { total_amount?: number }).total_amount ?? 0),
    0,
  );

  let walkInAddOnDeduction = Math.max(0, ledgerWalkInCharges);

  if (walkInAddOnDeduction <= 0) {
    let acQuery = supabase
      .from("booking_payments")
      .select("amount, payment_provider_data")
      .eq("tenant_id", tenantId)
      .in("status", ["completed", "partially_refunded"]);
    if (range.start) acQuery = acQuery.gte("created_at", range.start);
    if (range.end) acQuery = acQuery.lte("created_at", range.end);

    const { data: walkInPayments } = await acQuery;
    walkInAddOnDeduction = (walkInPayments ?? []).reduce((s, row) => {
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
