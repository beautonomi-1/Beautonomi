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
  /** False when the bookings query failed (do not treat as zero GMV). */
  available: boolean;
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
    available: true,
  };
}

type BookingGmvRow = { id?: string; total_amount?: number | null; payment_status?: string | null };

async function fetchAlignedBookingRowsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  range: { start?: string | null; end?: string | null },
): Promise<BookingGmvRow[]> {
  const statuses = [...ALIGNED_BOOKINGS_PAYMENT_STATUSES];
  const byId = new Map<string, BookingGmvRow>();

  let directQuery = supabase
    .from("bookings")
    .select("id, total_amount, payment_status")
    .eq("tenant_id", tenantId)
    .in("payment_status", statuses);
  if (range.start) directQuery = directQuery.gte("created_at", range.start);
  if (range.end) directQuery = directQuery.lte("created_at", range.end);
  directQuery = directQuery.order("id", { ascending: true });
  const { rows: directRows } = await fetchAllPages<BookingGmvRow>(directQuery);
  for (const row of directRows) {
    if (row.id) byId.set(String(row.id), row);
  }

  const { data: providerRows } = await supabase.from("providers").select("id").eq("tenant_id", tenantId);
  const providerIds = (providerRows ?? []).map((p: { id: string }) => p.id).filter(Boolean);
  if (providerIds.length > 0) {
    let viaProviderQuery = supabase
      .from("bookings")
      .select("id, total_amount, payment_status")
      .in("provider_id", providerIds)
      .in("payment_status", statuses);
    if (range.start) viaProviderQuery = viaProviderQuery.gte("created_at", range.start);
    if (range.end) viaProviderQuery = viaProviderQuery.lte("created_at", range.end);
    viaProviderQuery = viaProviderQuery.order("id", { ascending: true });
    const { rows: viaRows } = await fetchAllPages<BookingGmvRow>(viaProviderQuery);
    for (const row of viaRows) {
      if (row.id) byId.set(String(row.id), row);
    }
  }

  return [...byId.values()];
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
  let bookingRows: BookingGmvRow[] = [];
  try {
    bookingRows = await fetchAlignedBookingRowsForTenant(supabase, tenantId, range);
  } catch (bookingErr) {
    const message = bookingErr instanceof Error ? bookingErr.message : String(bookingErr);
    console.warn("computeAlignedBookingsGmv bookings query failed:", message);
    return { grossBookingsGmv: 0, walkInAddOnDeduction: 0, alignedBookingsGmv: 0, available: false };
  }

  const grossBookingsGmv = sumAlignedBookingsGmv(bookingRows, 0).grossBookingsGmv;

  let walkInAddOnDeduction = Math.max(0, ledgerWalkInCharges);

  if (walkInAddOnDeduction <= 0) {
    try {
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
        return addMoney(s, Number((row as { amount?: number }).amount ?? 0));
      }, 0);
    } catch (walkInErr) {
      console.warn("computeAlignedBookingsGmv walk-in query failed:", walkInErr);
    }
  }

  const alignedBookingsGmv = Math.max(0, subtractMoney(grossBookingsGmv, walkInAddOnDeduction));

  return {
    grossBookingsGmv: roundCurrency(grossBookingsGmv),
    walkInAddOnDeduction: roundCurrency(walkInAddOnDeduction),
    alignedBookingsGmv: roundCurrency(alignedBookingsGmv),
    available: true,
  };
}