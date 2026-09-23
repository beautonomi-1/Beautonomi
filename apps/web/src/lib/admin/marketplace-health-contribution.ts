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
  return agg.platform_take_net + agg.service_fee_revenue;
}

export function sumPlatformContributionByCustomer(
  ledgerRows: FinanceLedgerRow[],
  bookingIdToCustomerId: Map<string, string>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of ledgerRows) {
    const bid = row.booking_id != null ? String(row.booking_id) : "";
    if (!bid) continue;
    const cid = bookingIdToCustomerId.get(bid);
    if (!cid) continue;
    const type = String(row.transaction_type ?? "");
    const net = Number(row.net ?? row.amount ?? 0);
    let delta = 0;
    if (type === "payment" || type === "additional_charge_payment") {
      delta += Number(row.commission ?? 0) + Number(row.fees ?? 0);
    }
    if (type === "platform_fee" || type === "service_fee") {
      delta += net;
    }
    if (type === "refund") {
      delta -= Math.abs(net);
    }
    if (delta === 0 && (type === "payment" || type === "platform_fee")) {
      delta = net;
    }
    out.set(cid, (out.get(cid) ?? 0) + delta);
  }
  return out;
}
