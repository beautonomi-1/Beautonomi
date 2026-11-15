import { addMoney } from "@beautonomi/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";
import { posSaleTipInPeriod, pooledShare } from "./commission-calculator";

export type TipLedgerRow = {
  booking_id?: string | null;
  transaction_type?: string | null;
  amount?: number | string | null;
  net?: number | string | null;
  refund_component?: string | null;
};

export type TipAllocationShare = {
  booking_id: string;
  staff_id: string;
  amount: number;
};

/**
 * A tip counts on the day it is paid, split the way the appointment allocated it.
 * Only a tip refund comes off. A service or fee refund does not.
 */
export function tipsByStaffFromLedger(
  rows: readonly TipLedgerRow[],
  allocations: readonly TipAllocationShare[],
): Map<string, number> {
  const sharesByBooking = new Map<string, Array<{ staffId: string; amount: number }>>();
  for (const share of allocations) {
    if (!share.booking_id || !share.staff_id || !(share.amount > 0)) continue;
    const list = sharesByBooking.get(share.booking_id) ?? [];
    list.push({ staffId: share.staff_id, amount: share.amount });
    sharesByBooking.set(share.booking_id, list);
  }

  const attributed: Array<{ staff_id: string; amount: number }> = [];
  for (const row of rows) {
    const bookingId = row.booking_id?.trim() ?? "";
    const shares = bookingId ? sharesByBooking.get(bookingId) : undefined;
    if (!shares || shares.length === 0) continue;
    const shareTotal = shares.reduce((sum, share) => addMoney(sum, share.amount), 0);
    if (shareTotal <= 0) continue;

    let signed = 0;
    if (row.transaction_type === "tip") {
      signed = Math.max(0, Number(row.net ?? row.amount) || 0);
    } else if (row.transaction_type === "refund" && row.refund_component === "tip") {
      signed = -Math.abs(Number(row.net ?? row.amount) || 0);
    }
    if (signed === 0) continue;

    const staffIds = [...new Set(shares.map((share) => share.staffId))];
    for (const staffId of staffIds) {
      const portion = pooledShare({
        amount: Math.abs(signed),
        parts: shares.map((share) => ({ id: share.staffId, weight: share.amount })),
        id: staffId,
      });
      if (portion === 0) continue;
      attributed.push({ staff_id: staffId, amount: signed < 0 ? -portion : portion });
    }
  }

  const result = new Map<string, number>();
  for (const a of attributed) {
    const amt = a.amount;
    if (!a.staff_id || amt === 0) continue;
    result.set(a.staff_id, addMoney(result.get(a.staff_id) || 0, amt));
  }
  return result;
}

/**
 * Tips received in the pay period. The date is the payment, not the appointment.
 */
export async function getTipsByStaff(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  periodStart: Date,
  periodEnd: Date,
  locationId?: string | null,
): Promise<Map<string, number>> {
  const empty = new Map<string, number>();
  let rows: TipLedgerRow[] = [];
  try {
    const query = supabaseAdmin
      .from("finance_transactions")
      .select("id, booking_id, transaction_type, amount, net, refund_component, created_at")
      .eq("provider_id", providerId)
      .in("transaction_type", ["tip", "refund"])
      .gte("created_at", periodStart.toISOString())
      .lte("created_at", periodEnd.toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    rows = await fetchAllLedgerPages<TipLedgerRow>(
      query as unknown as Parameters<typeof fetchAllLedgerPages>[0],
    );
  } catch {
    return empty;
  }

  let bookingIds = [
    ...new Set(rows.map((row) => row.booking_id?.trim() ?? "").filter(Boolean)),
  ];
  if (bookingIds.length === 0) return empty;

  if (locationId) {
    const { data: bookings } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("provider_id", providerId)
      .eq("location_id", locationId)
      .in("id", bookingIds);
    const allowed = new Set((bookings ?? []).map((row: { id: string }) => row.id));
    rows = rows.filter((row) => row.booking_id && allowed.has(row.booking_id));
    bookingIds = bookingIds.filter((id) => allowed.has(id));
    if (bookingIds.length === 0) return empty;
  }

  const allocations: TipAllocationShare[] = [];
  const chunkSize = 80;
  for (let i = 0; i < bookingIds.length; i += chunkSize) {
    const { data } = await supabaseAdmin
      .from("booking_tip_allocations")
      .select("booking_id, staff_id, amount")
      .in("booking_id", bookingIds.slice(i, i + chunkSize));
    for (const row of data ?? []) {
      const allocation = row as { booking_id?: string; staff_id?: string; amount?: number | string | null };
      if (!allocation.booking_id || !allocation.staff_id) continue;
      allocations.push({
        booking_id: allocation.booking_id,
        staff_id: allocation.staff_id,
        amount: Number(allocation.amount) || 0,
      });
    }
  }

  return tipsByStaffFromLedger(rows, allocations);
}

/** Tips typed on a till sale. Separate from appointment tips, so both can be paid in the same week. */
export async function posSaleTipsByStaff(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  periodStart: Date,
  periodEnd: Date,
  locationId?: string | null,
): Promise<Map<string, number>> {
  const saleSelect = "id, staff_id, payment_status, notes, sale_date, updated_at";
  let paidQuery = supabaseAdmin
    .from("sales")
    .select(saleSelect)
    .eq("provider_id", providerId)
    .gte("sale_date", periodStart.toISOString())
    .lte("sale_date", periodEnd.toISOString())
    .in("payment_status", ["completed", "refunded"]);
  let returnedQuery = supabaseAdmin
    .from("sales")
    .select(saleSelect)
    .eq("provider_id", providerId)
    .eq("payment_status", "refunded")
    .gte("updated_at", periodStart.toISOString())
    .lte("updated_at", periodEnd.toISOString())
    .lt("sale_date", periodStart.toISOString());
  if (locationId) {
    paidQuery = paidQuery.eq("location_id", locationId);
    returnedQuery = returnedQuery.eq("location_id", locationId);
  }
  const [{ data: paidSales }, { data: returnedSales }] = await Promise.all([paidQuery, returnedQuery]);
  const sales = [...(paidSales ?? []), ...(returnedSales ?? [])].filter(
    (sale, index, list) =>
      list.findIndex((row) => (row as { id: string }).id === (sale as { id: string }).id) === index,
  );
  const result = new Map<string, number>();
  for (const sale of sales) {
    const row = sale as {
      staff_id?: string | null;
      payment_status?: string | null;
      notes?: string | null;
      sale_date?: string | null;
      updated_at?: string | null;
    };
    if (!row.staff_id) continue;
    const amount = posSaleTipInPeriod({
      notes: row.notes,
      paymentStatus: row.payment_status,
      saleDate: row.sale_date,
      updatedAt: row.updated_at,
      periodFrom: periodStart,
      periodTo: periodEnd,
    });
    if (amount === 0) continue;
    result.set(row.staff_id, addMoney(result.get(row.staff_id) || 0, amount));
  }
  return result;
}
