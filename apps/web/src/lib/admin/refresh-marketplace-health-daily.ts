import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateFinanceLedgerRows,
  platformRevenueNetFromAggregate,
} from "@/lib/admin/aggregate-finance-ledger-rows";
import { fetchFinanceLedgerRowsForTenant } from "@/lib/admin/finance-ledger-tenant";
import {
  computeBookingFrequency,
  computeContributionMargin,
  computeProviderBookingsPerWeek,
  computeRepeatRate,
  computeSupplyLiquidity,
  computeTakeRate,
  countTransactingProviders,
  type CompletedBookingLite,
} from "@/lib/admin/marketplace-health";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";

type BookingRow = {
  customer_id: string;
  provider_id: string;
  scheduled_at: string;
  status: string;
};

function endOfUtcDay(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  return x;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

async function fetchCompletedBookingsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  sinceIso: string,
  untilIso: string,
): Promise<CompletedBookingLite[]> {
  const rows = await fetchAllLedgerPages<BookingRow>(
    supabase
      .from("bookings")
      .select("customer_id, provider_id, scheduled_at, status")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("scheduled_at", sinceIso)
      .lte("scheduled_at", untilIso),
    50_000,
  );
  return rows.map((r) => ({
    customer_id: String(r.customer_id),
    provider_id: String(r.provider_id),
    scheduled_at: r.scheduled_at,
  }));
}

export async function refreshMarketplaceHealthDailyForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  since: Date,
  until: Date,
): Promise<number> {
  const lookbackStart = new Date(since);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 95);

  const bookings = await fetchCompletedBookingsForTenant(
    supabase,
    tenantId,
    lookbackStart.toISOString(),
    endOfUtcDay(until).toISOString(),
  );

  const { count: activeProviders } = await supabase
    .from("providers")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  let upserted = 0;
  for (let d = new Date(since); d <= until; d.setUTCDate(d.getUTCDate() + 1)) {
    const asOf = new Date(d);
    const dayEnd = endOfUtcDay(asOf);
    const dayStart = startOfUtcDay(asOf);

    const w30Start = new Date(dayEnd);
    w30Start.setUTCDate(w30Start.getUTCDate() - 30);
    const w90Start = new Date(dayEnd);
    w90Start.setUTCDate(w90Start.getUTCDate() - 90);
    const w7Start = new Date(dayEnd);
    w7Start.setUTCDate(w7Start.getUTCDate() - 7);

    const frequency = computeBookingFrequency(bookings, w30Start, dayEnd);
    const repeatRate = computeRepeatRate(bookings, w90Start, dayEnd);
    const tx7 = countTransactingProviders(bookings, w7Start, dayEnd);
    const tx30 = countTransactingProviders(bookings, w30Start, dayEnd);
    const active = activeProviders ?? 0;
    const liquidity = computeSupplyLiquidity(tx30, active);
    const bookingsPerWeek = computeProviderBookingsPerWeek(bookings, w30Start, dayEnd);

    let dayLedger;
    try {
      dayLedger = await fetchFinanceLedgerRowsForTenant(supabase, tenantId, {
        start: dayStart.toISOString(),
        end: dayEnd.toISOString(),
      });
    } catch {
      dayLedger = [];
    }
    const agg = aggregateFinanceLedgerRows(dayLedger);
    const takeRate = computeTakeRate(agg);
    const platformNet = platformRevenueNetFromAggregate(agg);
    const contributionMargin = computeContributionMargin(agg);

    const completedDay = bookings.filter((b) => {
      const t = new Date(b.scheduled_at).getTime();
      return t >= dayStart.getTime() && t <= dayEnd.getTime();
    }).length;

    const asOfStr = dayStart.toISOString().slice(0, 10);
    const { error } = await supabase.from("marketplace_health_daily").upsert(
      {
        tenant_id: tenantId,
        as_of: asOfStr,
        booking_frequency_30d: Math.round(frequency * 1000) / 1000,
        repeat_rate_90d: Math.round(repeatRate * 10000) / 10000,
        transacting_providers_7d: tx7,
        transacting_providers_30d: tx30,
        active_providers: active,
        supply_liquidity: Math.round(liquidity * 10000) / 10000,
        provider_bookings_per_week: Math.round(bookingsPerWeek * 100) / 100,
        take_rate: Math.round(takeRate * 10000) / 10000,
        gmv: agg.service_collected_gross,
        platform_net: platformNet,
        contribution_margin: contributionMargin,
        completed_bookings_day: completedDay,
        booking_take_net: agg.platform_take_net,
        subscription_net: agg.subscription_net,
        ads_net: agg.ads_net,
        service_fees_net: agg.service_fee_revenue,
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,as_of" },
    );
    if (!error) upserted++;
  }
  return upserted;
}

export async function refreshMarketplaceHealthDailyAllTenants(
  supabase: SupabaseClient,
  since: Date,
  until: Date,
): Promise<{ tenants: number; rows: number }> {
  const { data: tenants, error } = await supabase.from("tenants").select("id");
  if (error) throw error;
  let rows = 0;
  for (const t of tenants ?? []) {
    const tid = String((t as { id: string }).id);
    rows += await refreshMarketplaceHealthDailyForTenant(supabase, tid, since, until);
  }
  return { tenants: tenants?.length ?? 0, rows };
}
