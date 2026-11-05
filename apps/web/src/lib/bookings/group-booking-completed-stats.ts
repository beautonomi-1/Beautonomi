import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RECOGNIZED_REVENUE_TYPES,
  recognizedRevenue,
  type ProviderRevenueLedgerRow,
} from "@/lib/reports/provider-revenue-semantics";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";
import { MAX_FINANCE_TRANSACTIONS } from "@/lib/reports/constants";
import { chunkIds, fetchInIdChunks } from "@/lib/provider-ops/postgrest-unbounded";

export type CompletedGroupBookingAggregateStats = {
  completed_count: number;
  session_booked_gross: number;
  participant_booked_gross: number;
  recognized_earnings: number;
};

export async function computeCompletedGroupBookingStats(
  admin: SupabaseClient,
  providerId: string,
): Promise<CompletedGroupBookingAggregateStats> {
  const { data: completedRows, error } = await admin
    .from("group_bookings")
    .select("id, total_price, booking_participants(booking_id)")
    .eq("provider_id", providerId)
    .eq("status", "completed");
  if (error) throw error;

  const rows = completedRows ?? [];
  let sessionBookedGross = 0;
  const bookingIds = new Set<string>();
  for (const row of rows) {
    sessionBookedGross += Number((row as { total_price?: number | null }).total_price ?? 0);
    const participants = (row as { booking_participants?: { booking_id?: string | null }[] })
      .booking_participants;
    for (const p of participants ?? []) {
      if (typeof p.booking_id === "string" && p.booking_id.trim()) {
        bookingIds.add(p.booking_id.trim());
      }
    }
  }

  const uniqueBookingIds = [...bookingIds];
  let participantBookedGross = 0;
  if (uniqueBookingIds.length > 0) {
    const bookingRows = await fetchInIdChunks<{ total_amount?: number | null }>(
      uniqueBookingIds,
      (slice) => admin.from("bookings").select("id, total_amount").in("id", slice),
    );
    participantBookedGross = bookingRows.reduce(
      (sum, b) => sum + Number(b.total_amount ?? 0),
      0,
    );
  }

  let recognizedEarnings = 0;
  if (uniqueBookingIds.length > 0) {
    const ledgerRows: ProviderRevenueLedgerRow[] = [];
    for (const slice of chunkIds(uniqueBookingIds, 150)) {
      const ledgerQuery = admin
        .from("finance_transactions")
        .select("transaction_type, amount, net, booking_id")
        .eq("provider_id", providerId)
        .in("booking_id", slice)
        .in("transaction_type", [...RECOGNIZED_REVENUE_TYPES])
        .order("created_at", { ascending: true });
      const page = await fetchAllLedgerPages<ProviderRevenueLedgerRow>(
        ledgerQuery as Parameters<typeof fetchAllLedgerPages>[0],
        MAX_FINANCE_TRANSACTIONS,
      );
      ledgerRows.push(...page);
    }
    recognizedEarnings = recognizedRevenue(ledgerRows);
  }

  return {
    completed_count: rows.length,
    session_booked_gross: sessionBookedGross,
    participant_booked_gross: participantBookedGross,
    recognized_earnings: recognizedEarnings,
  };
}
