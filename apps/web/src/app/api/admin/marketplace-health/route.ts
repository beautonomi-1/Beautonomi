import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  deltaPct,
  fetchLatestMarketplaceHealth,
  fetchMarketplaceHealthSeries,
  marketplaceHealthContractsPayload,
} from "@/lib/admin/marketplace-health-api";
import {
  computeBookingFrequency,
  computeCohortRetention,
  computeRepeatRate,
  countTransactingProviders,
  computeProviderBookingsPerWeek,
  computeSupplyLiquidity,
  type CompletedBookingLite,
} from "@/lib/admin/marketplace-health";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";
    const includeCohort = searchParams.get("cohort") === "1";

    const now = new Date();
    let days = 30;
    if (period === "7d") days = 7;
    else if (period === "90d") days = 90;
    else if (period === "1y") days = 365;

    const since = new Date(now);
    since.setUTCDate(since.getUTCDate() - days + 1);

    const latest = await fetchLatestMarketplaceHealth(supabase, tenantId);
    const series = await fetchMarketplaceHealthSeries(
      supabase,
      tenantId,
      since.toISOString(),
      now.toISOString(),
    );

    let prior: typeof latest = null;
    if (latest?.as_of) {
      const priorDate = new Date(latest.as_of);
      priorDate.setUTCDate(priorDate.getUTCDate() - days);
      const { data } = await supabase
        .from("marketplace_health_daily")
        .select("*")
        .eq("tenant_id", tenantId)
        .lte("as_of", priorDate.toISOString().slice(0, 10))
        .order("as_of", { ascending: false })
        .limit(1)
        .maybeSingle();
      prior = (data as typeof latest) ?? null;
    }

    let cohort = null as ReturnType<typeof computeCohortRetention> | null;
    if (includeCohort) {
      const lookback = new Date(now);
      lookback.setUTCMonth(lookback.getUTCMonth() - 18);
      const rows = await fetchAllLedgerPages<{
        customer_id: string;
        provider_id: string;
        scheduled_at: string;
      }>(
        supabase
          .from("bookings")
          .select("customer_id, provider_id, scheduled_at")
          .eq("tenant_id", tenantId)
          .eq("status", "completed")
          .gte("scheduled_at", lookback.toISOString()),
        50_000,
      );
      cohort = computeCohortRetention(rows as CompletedBookingLite[]);
    }

    const liveFallback =
      latest == null
        ? await computeLiveHealthFallback(supabase, tenantId, now)
        : null;

    const snap = latest ?? liveFallback?.snapshot;
    const pri = prior ?? liveFallback?.prior;

    return successResponse({
      period,
      latest: snap,
      prior: pri,
      series,
      deltas: snap
        ? {
            repeat_rate_90d: deltaPct(snap.repeat_rate_90d, pri?.repeat_rate_90d),
            booking_frequency_30d: deltaPct(snap.booking_frequency_30d, pri?.booking_frequency_30d),
            transacting_providers_30d: deltaPct(snap.transacting_providers_30d, pri?.transacting_providers_30d),
            provider_bookings_per_week: deltaPct(
              snap.provider_bookings_per_week,
              pri?.provider_bookings_per_week,
            ),
            take_rate: deltaPct(snap.take_rate, pri?.take_rate),
            contribution_margin: deltaPct(snap.contribution_margin, pri?.contribution_margin),
          }
        : null,
      cohort,
      contracts: marketplaceHealthContractsPayload(),
      metrics_notes: {
        snapshot_basis:
          "Trailing windows ending on as_of from marketplace_health_daily (nightly cron). Completed bookings only for frequency and repeat.",
        live_fallback: latest == null ? "Computed on demand when no snapshot exists yet." : undefined,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load marketplace health");
  }
}

async function computeLiveHealthFallback(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  tenantId: string,
  now: Date,
) {
  const w30Start = new Date(now);
  w30Start.setUTCDate(w30Start.getUTCDate() - 30);
  const w90Start = new Date(now);
  w90Start.setUTCDate(w90Start.getUTCDate() - 90);

  const rows = await fetchAllLedgerPages<{
    customer_id: string;
    provider_id: string;
    scheduled_at: string;
  }>(
    supabase
      .from("bookings")
      .select("customer_id, provider_id, scheduled_at")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("scheduled_at", w90Start.toISOString()),
    20_000,
  );
  const bookings = rows as CompletedBookingLite[];

  const { count: activeProviders } = await supabase
    .from("providers")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  const tx30 = countTransactingProviders(bookings, w30Start, now);
  const snapshot = {
    as_of: now.toISOString().slice(0, 10),
    booking_frequency_30d: computeBookingFrequency(bookings, w30Start, now),
    repeat_rate_90d: computeRepeatRate(bookings, w90Start, now),
    transacting_providers_7d: countTransactingProviders(
      bookings,
      new Date(now.getTime() - 7 * 86400000),
      now,
    ),
    transacting_providers_30d: tx30,
    active_providers: activeProviders ?? 0,
    supply_liquidity: computeSupplyLiquidity(tx30, activeProviders ?? 0),
    provider_bookings_per_week: computeProviderBookingsPerWeek(bookings, w30Start, now),
    take_rate: null,
    gmv: null,
    platform_net: null,
    contribution_margin: null,
    completed_bookings_day: 0,
    booking_take_net: null,
    subscription_net: null,
    ads_net: null,
    service_fees_net: null,
    refreshed_at: now.toISOString(),
  };
  return { snapshot, prior: null };
}
