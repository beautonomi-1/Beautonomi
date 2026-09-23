import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeBookingFrequency,
  computeRepeatRate,
  medianDaysBetweenVisits,
  daysSince,
  type CompletedBookingLite,
} from "@/lib/admin/marketplace-health";
import { fetchFinanceLedgerExportRowsForTenant } from "@/lib/admin/finance-ledger-tenant";
import { sumPlatformContributionByCustomer } from "@/lib/admin/marketplace-health-contribution";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";
import { MAX_BOOKINGS_FOR_REPORT } from "@/lib/reports/constants";

type BookingRow = {
  id: string;
  customer_id: string;
  scheduled_at: string;
  total_amount?: number;
  status: string;
};

export async function buildCustomerReportMetrics(
  supabase: SupabaseClient,
  tenantId: string,
  startISO: string,
  endISO: string,
  customerIds: string[],
) {
  const completed = customerIds.length
    ? await fetchAllLedgerPages<BookingRow>(
        supabase
          .from("bookings")
          .select("id, customer_id, scheduled_at, total_amount, status")
          .eq("tenant_id", tenantId)
          .in("customer_id", customerIds)
          .eq("status", "completed")
          .gte("scheduled_at", startISO)
          .lte("scheduled_at", endISO),
        MAX_BOOKINGS_FOR_REPORT,
      )
    : [];

  const start = new Date(startISO);
  const end = new Date(endISO);
  const frequency = computeBookingFrequency(completed as CompletedBookingLite[], start, end);
  const repeatRate = computeRepeatRate(completed as CompletedBookingLite[], start, end);
  const medianDays = medianDaysBetweenVisits(completed as CompletedBookingLite[]);

  const bookingIdToCustomer = new Map<string, string>();
  for (const b of completed) {
    bookingIdToCustomer.set(String(b.id), String(b.customer_id));
  }
  const ledger = await fetchFinanceLedgerExportRowsForTenant(
    supabase,
    tenantId,
    { start: startISO, end: endISO },
    {},
  );
  const contributionByCustomer = sumPlatformContributionByCustomer(ledger, bookingIdToCustomer);

  const completedByCustomer: Record<
    string,
    { count: number; total_amount: number; last_completed_at?: string }
  > = {};
  for (const b of completed) {
    const id = b.customer_id;
    if (!completedByCustomer[id]) completedByCustomer[id] = { count: 0, total_amount: 0 };
    completedByCustomer[id].count += 1;
    completedByCustomer[id].total_amount += Number(b.total_amount ?? 0);
    const prev = completedByCustomer[id].last_completed_at;
    if (!prev || new Date(b.scheduled_at) > new Date(prev)) {
      completedByCustomer[id].last_completed_at = b.scheduled_at;
    }
  }

  return {
    frequency,
    repeatRate,
    medianDaysBetweenVisits: medianDays,
    contributionByCustomer,
    completedByCustomer,
  };
}

export function countVisitBuckets(completedByCustomer: Record<string, { count: number }>) {
  let one = 0;
  let twoThree = 0;
  let fourPlus = 0;
  for (const v of Object.values(completedByCustomer)) {
    if (v.count === 1) one++;
    else if (v.count <= 3) twoThree++;
    else fourPlus++;
  }
  return { one, twoThree, fourPlus };
}

export { daysSince };
