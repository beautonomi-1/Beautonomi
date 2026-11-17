import { addMoney } from "@beautonomi/utils";
import type { FinanceLedgerRow } from "@/lib/admin/finance-ledger-tenant";
import { aggregateFinanceLedgerRows } from "@/lib/admin/aggregate-finance-ledger-rows";

/**
 * Platform booking revenue attributable to a set of booking ids (ledger rows joined by booking_id).
 */
export function sumPlatformContributionForBookings(
  ledgerRows: FinanceLedgerRow[],
  bookingIds: Set<string>,
): number {
  const filtered = ledgerRows.filter((r) => {
    const bid = r.booking_id != null ? String(r.booking_id) : "";
    return bid && bookingIds.has(bid);
  });
  if (filtered.length === 0) return 0;
  const agg = aggregateFinanceLedgerRows(filtered);
  return addMoney(agg.platform_take_net, agg.service_fee_revenue);
}

export function sumPlatformContributionByCustomer(
  ledgerRows: FinanceLedgerRow[],
  bookingIdToCustomerId: Map<string, string>,
): Map<string, number> {
  const rowsByCustomer = new Map<string, FinanceLedgerRow[]>();
  for (const row of ledgerRows) {
    const bid = row.booking_id != null ? String(row.booking_id) : "";
    if (!bid) continue;
    const cid = bookingIdToCustomerId.get(bid);
    if (!cid) continue;
    const bucket = rowsByCustomer.get(cid) ?? [];
    bucket.push(row);
    rowsByCustomer.set(cid, bucket);
  }

  const out = new Map<string, number>();
  for (const [customerId, rows] of rowsByCustomer) {
    const agg = aggregateFinanceLedgerRows(rows);
    out.set(customerId, addMoney(agg.platform_take_net, agg.service_fee_revenue));
  }
  return out;
}