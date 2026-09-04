import "server-only";

import { NextRequest } from 'next/server';
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { format, subDays } from "date-fns";
import { checkBookingLimit } from "@/lib/subscriptions/limit-checker";
import { formatProviderPortalLimitMessage } from "@/lib/subscriptions/subscription-limit-messages";
import { getAvailablePayoutBalance } from "@/lib/provider/available-payout-balance";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import {
  addDaysToYmd,
  dateRangeBoundsUtc,
  formatDateYmd,
  fromBusinessTime,
  formatInTz,
  nowInTz,
  resolveTz,
} from "@/lib/dates/provider-tz";
import { buildProviderActivityFeed } from "@/lib/provider/build-provider-activity-feed";
import { filterLedgerRowsForLocation } from "@/lib/reports/provider-report-utils";
import { buildServiceLedgerPerformance } from "@/lib/reports/service-ledger-performance";
import { isProviderEarningsRefundComponent } from "@/lib/ledger/refund-components";
import {
  computeDashboardEarningsMix,
  recognizedRevenue,
  recognizedRevenueInRange,
} from "@/lib/reports/provider-revenue-semantics";
import {
  dashboardBookingLocationOrFilterFallbacks,
  normalizeDashboardLocationId,
} from "@/lib/server/provider/dashboard-booking-location-filter";
import { getProviderRetailTakingsSummary } from "@/lib/reports/provider-retail-takings";
import {
  fetchUpcomingBookingsForDashboard,
  UPCOMING_BOOKINGS_BASIS,
} from "@/lib/server/provider/fetch-upcoming-bookings-for-dashboard";
import { MAX_FINANCE_TRANSACTIONS } from "@/lib/reports/constants";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";
import { fetchAllPaged } from "@/lib/provider-ops/postgrest-unbounded";
import {
  PROVIDER_POINTS_SELECT,
  fetchProviderGamificationHealSignals,
  syncProviderGamification,
} from "@/lib/provider/ensure-provider-gamification-synced";
import {
  buildProgressToNextBadge,
  resolveJoinedBadge,
} from "@/lib/provider/build-gamification-view";
import {
  getPriorMonthMtdComparisonBounds,
  getPriorWeekComparisonBounds,
} from "@/lib/server/provider/dashboard-comparison-periods";
import { getDashboardRecognizedRevenueBounds } from "@/lib/server/provider/dashboard-revenue-period-bounds";
import { buildDashboardPeriodBreakdown } from "@/lib/server/provider/build-dashboard-period-breakdown";
import { countUnrecognizedPaymentsToday } from "@/lib/server/provider/count-unrecognized-payments-today";
import {
  getProviderDashboardSnapshotCached,
  isDashboardSnapshotRpcEnabled,
  type DashboardSnapshot,
} from "@/lib/server/provider/dashboard-snapshot-rpc";

const DASHBOARD_CACHE_TTL_MS = 5000;
const MAX_DASHBOARD_CACHE_ENTRIES = 400;
/** Safety bound for dashboard booking status / schedule aggregates (paginated, not a silent 5k cap). */
const MAX_DASHBOARD_BOOKINGS = 50_000;
const dashboardResponseCache = new Map<string, { expiresAt: number; data: any }>();

const EMPTY_RETAIL_TAKINGS = {
  today: { amount: 0, count: 0 },
  this_week: { amount: 0, count: 0 },
  this_month: { amount: 0, count: 0 },
  lifetime: { amount: 0, count: 0 },
};

const EMPTY_PAYOUT_BALANCE = {
  availableBalance: 0,
  pendingPayoutsSum: 0,
  rawBalance: 0,
  hasNegativeBalance: false,
};

async function withDashboardFallback<T>(
  label: string,
  fallback: T,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[dashboard] ${label} failed:`, err);
    return fallback;
  }
}

const PENDING_BOOKING_STATUSES = new Set(["pending", "pending_payment"]);
const CONFIRMED_BOOKING_STATUSES = new Set(["confirmed", "waiting", "checked_in"]);
const ACTIVE_BOOKING_STATUSES = new Set([
  "pending",
  "pending_payment",
  "confirmed",
  "waiting",
  "checked_in",
  "in_progress",
]);
const SCHEDULE_COUNT_STATUSES = new Set([
  "pending",
  "pending_payment",
  "confirmed",
  "waiting",
  "checked_in",
  "in_progress",
  "completed",
]);

function pruneDashboardResponseCache(now: number): void {
  for (const [key, entry] of dashboardResponseCache.entries()) {
    if (entry.expiresAt <= now) {
      dashboardResponseCache.delete(key);
    }
  }
  if (dashboardResponseCache.size <= MAX_DASHBOARD_CACHE_ENTRIES) {
    return;
  }
  const overflow = dashboardResponseCache.size - MAX_DASHBOARD_CACHE_ENTRIES;
  const keys = Array.from(dashboardResponseCache.keys());
  for (let i = 0; i < overflow; i += 1) {
    dashboardResponseCache.delete(keys[i]);
  }
}

/**
 * Shared dashboard payload for GET /api/provider/dashboard and RSC (direct call — no HTTP hop).
 */
export async function getProviderDashboardResponse(request: NextRequest) {
  try {
    // Require provider_owner or provider_staff role
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    // Get location_id from query params if provided
    const { searchParams } = new URL(request.url);
    const locationId = normalizeDashboardLocationId(searchParams.get('location_id'));
    const includeInsights = searchParams.get("include") === "insights";

    // Use service role client for all queries to avoid RLS infinite recursion
    // This is safe because we're already authenticated and checking user_id matches
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin, { request });
    if (!providerId) return notFoundResponse("Provider not found");

    const cacheKey = `${providerId}:${locationId || "all"}:${includeInsights ? "insights" : "base"}`;
    const cached = dashboardResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const cachedResponse = successResponse(cached.data);
      cachedResponse.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=10');
      return cachedResponse;
    }

    const { data: providerData, error: providerError } = await supabaseAdmin
      .from('providers')
      .select('id, tenant_id, status, business_name, rating_average, review_count, offers_mobile_services, max_service_distance_km, is_distance_filter_enabled, timezone')
      .eq('id', providerId)
      .maybeSingle();
    if (providerError || !providerData) {
      return handleApiError(
        new Error(providerError?.message ?? 'Provider not found'),
        'PROVIDER_FETCH_ERROR',
        500
      );
    }

    // Provider visibility: what service types they offer (for identity strip)
    const supportsHouseCalls = providerData.offers_mobile_services !== false;
    const { count: salonLocationCount } = await supabaseAdmin
      .from('provider_locations')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .eq('location_type', 'salon');
    const supportsSalon = (salonLocationCount ?? 0) > 0;
    const maxServiceDistanceKm = providerData.max_service_distance_km ?? null;
    const isDistanceFilterEnabled = providerData.is_distance_filter_enabled === true;

    const providerTz = resolveTz((providerData as { timezone?: string | null }).timezone);
    const now = new Date();
    const businessNow = nowInTz(providerTz);
    const startOfTodayLocal = new Date(businessNow);
    startOfTodayLocal.setHours(0, 0, 0, 0);
    const startOfToday = fromBusinessTime(startOfTodayLocal, providerTz);
    const startOfWeekLocal = new Date(startOfTodayLocal);
    startOfWeekLocal.setDate(startOfTodayLocal.getDate() - startOfTodayLocal.getDay());
    const startOfWeek = fromBusinessTime(startOfWeekLocal, providerTz);
    const startOfMonth = fromBusinessTime(
      new Date(businessNow.getFullYear(), businessNow.getMonth(), 1, 0, 0, 0, 0),
      providerTz,
    );
    const startOfLastMonth = fromBusinessTime(
      new Date(businessNow.getFullYear(), businessNow.getMonth() - 1, 1, 0, 0, 0, 0),
      providerTz,
    );
    const endOfLastMonth = fromBusinessTime(
      new Date(businessNow.getFullYear(), businessNow.getMonth(), 0, 23, 59, 59, 999),
      providerTz,
    );
    const todayEndLocal = new Date(startOfTodayLocal);
    todayEndLocal.setDate(startOfTodayLocal.getDate() + 1);
    const todayEnd = fromBusinessTime(todayEndLocal, providerTz);
    const startOfNextWeekLocal = new Date(startOfWeekLocal);
    startOfNextWeekLocal.setDate(startOfWeekLocal.getDate() + 7);
    const startOfNextWeek = fromBusinessTime(startOfNextWeekLocal, providerTz);
    const startOfNextMonth = fromBusinessTime(
      new Date(businessNow.getFullYear(), businessNow.getMonth() + 1, 1, 0, 0, 0, 0),
      providerTz,
    );

    // Part M: `DASHBOARD_SNAPSHOT_RPC=1` moves the lifetime status tiles, schedule
    // counts and recognized-revenue windows into Postgres (provider_dashboard_snapshot,
    // migration 877; 30s cache). When the RPC answers, the bookings scan below is
    // narrowed to the current period (only period_breakdown still needs per-row
    // channel/status mix) instead of paging up to MAX_DASHBOARD_BOOKINGS rows.
    // Any RPC failure silently falls back to the Node path.
    const snapshotPromise: Promise<DashboardSnapshot | null> = isDashboardSnapshotRpcEnabled()
      ? getProviderDashboardSnapshotCached(supabaseAdmin as any, {
          providerId,
          locationId,
          timezone: providerTz,
        })
          .then((result) => {
            if (result.ok === false) {
              console.warn("[dashboard_snapshot_rpc] falling back to Node path:", result.error);
              return null;
            }
            return result.snapshot;
          })
          .catch((err: unknown) => {
            console.warn("[dashboard_snapshot_rpc] falling back to Node path:", err);
            return null;
          })
      : Promise.resolve(null);
    const periodBookingsFrom = new Date(Math.min(startOfWeek.getTime(), startOfMonth.getTime()));
    const periodBookingsTo = new Date(Math.max(startOfNextWeek.getTime(), startOfNextMonth.getTime()));

    // Load status, created_at, scheduled_at, and location_type in parallel with finance data.
    // Paginate bookings so high-volume providers are not silently capped at PostgREST max_rows.
    const locationFilters = locationId ? dashboardBookingLocationOrFilterFallbacks(locationId) : [];
    let locationFilterIndex = 0;

    const fetchDashboardBookingsPage = async (from: number, to: number, periodOnly: boolean) => {
      const build = (orFilter: string | null) => {
        let q = supabaseAdmin
          .from("bookings")
          .select("id, status, created_at, scheduled_at, location_id, location_type, booking_source")
          .eq("provider_id", providerId)
          // `scheduled_at` is nullable and non-unique; add `id` as a stable tiebreaker so
          // ties don't shift across page boundaries (skip/dupe rows in status tiles).
          .order("scheduled_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to);
        if (periodOnly) {
          q = q
            .gte("scheduled_at", periodBookingsFrom.toISOString())
            .lt("scheduled_at", periodBookingsTo.toISOString());
        }
        if (orFilter) {
          q = q.or(orFilter);
        }
        return q;
      };

      if (!locationId) {
        return build(null);
      }

      for (let i = locationFilterIndex; i < locationFilters.length; i += 1) {
        const result = await build(locationFilters[i]);
        if (!result.error) {
          locationFilterIndex = i;
          return result;
        }
        console.warn("[dashboard] booking location filter failed, retrying simpler filter:", result.error);
      }
      console.warn("[dashboard] all booking location filters failed, loading unscoped bookings");
      return build(null);
    };

    // For finance transactions, we need to filter by location through bookings
    // This requires a join or subquery. For now, we'll filter finance transactions
    // by checking if they're related to bookings with the selected location
    const financeQuery = supabaseAdmin
      .from("finance_transactions")
      .select("transaction_type, amount, net, description, created_at, booking_id, product_order_id, refund_component")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    // If location filter is provided, we'll need to filter finance transactions
    // by joining with bookings. For performance, we'll do this in memory after fetching.
    // The ledger is fully paginated (not capped) so lifetime totals never undercount.
    const [{ snapshot, allBookings }, ledgerRows] = await Promise.all([
      snapshotPromise.then(async (snapshot) => {
        const periodOnly = snapshot !== null;
        const rows = await fetchAllPaged(async (from, to) => {
          const { data, error } = await fetchDashboardBookingsPage(from, to, periodOnly);
          return { data, error };
        }, MAX_DASHBOARD_BOOKINGS);
        return { snapshot, allBookings: rows.slice(0, MAX_DASHBOARD_BOOKINGS) };
      }),
      withDashboardFallback("ledger", [] as Awaited<ReturnType<typeof fetchAllLedgerPages>>, () =>
        fetchAllLedgerPages(financeQuery as any, MAX_FINANCE_TRANSACTIONS),
      ),
    ]);

    const totalBookings = snapshot ? snapshot.bookings.total_bookings : allBookings.length;
    const bookingsTruncated = snapshot ? false : allBookings.length >= MAX_DASHBOARD_BOOKINGS;
    
    // Debug: Log booking statuses to help diagnose issues
    if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_DASHBOARD === "1") {
      const statusCounts = allBookings.reduce((acc: Record<string, number>, booking: any) => {
        acc[booking.status] = (acc[booking.status] || 0) + 1;
        return acc;
      }, {});
      console.log('Dashboard booking status counts:', {
        total: totalBookings,
        statusCounts,
        locationId: locationId || 'all',
      });
    }
    
    // Count by status (single pass through array - faster than multiple filters)
    let activeBookings = 0;
    let confirmedBookings = 0;
    let completedBookings = 0;
    let cancelledBookings = 0;
    let noShowBookings = 0;
    let pendingBookings = 0;
    
    // Count by location_type for at-home vs at-salon breakdown
    let atHomeBookings = 0;
    let atSalonBookings = 0;
    let atHomeCompleted = 0;
    let atSalonCompleted = 0;
    let atHomeConfirmed = 0;
    let atSalonConfirmed = 0;
    let atHomePending = 0;
    let atSalonPending = 0;
    let atHomeCancelled = 0;
    let atSalonCancelled = 0;
    let atHomeNoShow = 0;
    let atSalonNoShow = 0;

    if (snapshot) {
      const c = snapshot.bookings;
      activeBookings = c.active_bookings;
      confirmedBookings = c.confirmed_bookings;
      completedBookings = c.completed_bookings;
      cancelledBookings = c.cancelled_bookings;
      noShowBookings = c.no_show_bookings;
      pendingBookings = c.pending_bookings;
      atHomeBookings = c.at_home_bookings;
      atSalonBookings = c.at_salon_bookings;
      atHomeCompleted = c.at_home_completed;
      atSalonCompleted = c.at_salon_completed;
      atHomeConfirmed = c.at_home_confirmed;
      atSalonConfirmed = c.at_salon_confirmed;
      atHomePending = c.at_home_pending;
      atSalonPending = c.at_salon_pending;
      atHomeCancelled = c.at_home_cancelled;
      atSalonCancelled = c.at_salon_cancelled;
      atHomeNoShow = c.at_home_no_show;
      atSalonNoShow = c.at_salon_no_show;
    }

    // Node path (snapshot === null): allBookings holds the full lifetime set.
    for (const booking of snapshot ? [] : allBookings) {
      const status = String(booking.status || "");
      const isAtHome = booking.location_type === "at_home";
      const isAtSalon = booking.location_type === "at_salon";

      if (ACTIVE_BOOKING_STATUSES.has(status)) {
        activeBookings++;
      }

      // Count by status
      if (CONFIRMED_BOOKING_STATUSES.has(status)) {
        confirmedBookings++;
        if (isAtHome) atHomeConfirmed++;
        else if (isAtSalon) atSalonConfirmed++;
      } else if (PENDING_BOOKING_STATUSES.has(status)) {
        pendingBookings++;
        if (isAtHome) atHomePending++;
        else if (isAtSalon) atSalonPending++;
      } else {
        switch (status) {
          case 'completed': 
            completedBookings++; 
            if (isAtHome) atHomeCompleted++;
            else if (isAtSalon) atSalonCompleted++;
            break;
          case 'cancelled': 
            cancelledBookings++; 
            if (isAtHome) atHomeCancelled++;
            else if (isAtSalon) atSalonCancelled++;
            break;
          case 'no_show': 
            noShowBookings++; 
            if (isAtHome) atHomeNoShow++;
            else if (isAtSalon) atSalonNoShow++;
            break;
        }
      }

      // Count by location_type
      if (isAtHome) {
        atHomeBookings++;
      } else if (isAtSalon) {
        atSalonBookings++;
      }
    }

    // Calculate time-based metrics in single pass (optimized)
    let upcomingBookingsToday = 0;
    let bookingsScheduledThisWeek = 0;
    let bookingsScheduledThisMonth = 0;
    let appointmentsYesterday = 0;
    let appointmentsPriorWeek = 0;
    let appointmentsPriorMonth = 0;

    const todayYmdForBounds = formatDateYmd(businessNow, providerTz);
    const weekStartYmdForBounds = formatDateYmd(startOfWeekLocal, providerTz);
    const yesterdayYmd = addDaysToYmd(todayYmdForBounds, -1);
    const yesterdayBounds = dateRangeBoundsUtc(yesterdayYmd, yesterdayYmd, providerTz);
    const startOfYesterday = new Date(yesterdayBounds.fromIso);
    const endOfYesterday = new Date(yesterdayBounds.toIso);
    const priorWeekComparison = getPriorWeekComparisonBounds({
      timezone: providerTz,
      businessNow,
      startOfWeekLocal,
    });
    const priorMonthMtdComparison = getPriorMonthMtdComparisonBounds({
      timezone: providerTz,
      businessNow,
    });
    const startOfPriorWeek = priorWeekComparison.start;
    const endOfPriorWeek = priorWeekComparison.end;
    const startOfPriorMonthMtd = priorMonthMtdComparison.start;
    const endOfPriorMonthMtd = priorMonthMtdComparison.end;

    if (snapshot) {
      upcomingBookingsToday = snapshot.schedule.today;
      bookingsScheduledThisWeek = snapshot.schedule.this_week;
      bookingsScheduledThisMonth = snapshot.schedule.this_month;
      appointmentsYesterday = snapshot.schedule.yesterday;
      appointmentsPriorWeek = snapshot.schedule.prior_week;
      appointmentsPriorMonth = snapshot.schedule.prior_month;
    }

    for (const booking of snapshot ? [] : allBookings) {
      const scheduledDate = booking.scheduled_at ? new Date(booking.scheduled_at) : null;
      const status = String(booking.status || "");

      if (!scheduledDate || !SCHEDULE_COUNT_STATUSES.has(status)) continue;

      if (scheduledDate >= startOfToday && scheduledDate < todayEnd) {
        upcomingBookingsToday++;
      }

      if (scheduledDate >= startOfWeek && scheduledDate < startOfNextWeek) {
        bookingsScheduledThisWeek++;
      }

      if (scheduledDate >= startOfMonth && scheduledDate < startOfNextMonth) {
        bookingsScheduledThisMonth++;
      }

      if (scheduledDate >= startOfYesterday && scheduledDate <= endOfYesterday) {
        appointmentsYesterday++;
      }

      if (scheduledDate >= startOfPriorWeek && scheduledDate <= endOfPriorWeek) {
        appointmentsPriorWeek++;
      }

      if (scheduledDate >= startOfPriorMonthMtd && scheduledDate <= endOfPriorMonthMtd) {
        appointmentsPriorMonth++;
      }
    }

    // Revenue streams from finance ledger (already loaded in parallel above)
    let rows = ledgerRows || [];
    if (locationId && rows.length > 0) {
      rows = await withDashboardFallback("ledger_location_filter", rows, () =>
        filterLedgerRowsForLocation(supabaseAdmin as any, providerId, rows as any, locationId),
      );
    }
    
    // Optimize: Pre-filter and pre-parse dates for faster processing
    const parsedRows = rows.map((r: any) => ({
      ...r,
      createdDate: new Date(r.created_at),
      netValue: Number(r.net ?? r.amount ?? 0),
      amountValue: Number(r.amount || 0),
      descriptionText: String(r.description || ""),
    }));

    // Optimized sum functions - single pass with pre-parsed data
    const sumNet = (types: string[], start?: Date, end?: Date) => {
      let sum = 0;
      for (const r of parsedRows) {
        if (!types.includes(r.transaction_type)) continue;
        if (start && r.createdDate < start) continue;
        if (end && r.createdDate > end) continue;
        sum += r.netValue;
      }
      return sum;
    };

    const sumAmount = (types: string[], start?: Date, end?: Date) => {
      let sum = 0;
      for (const r of parsedRows) {
        if (!types.includes(r.transaction_type)) continue;
        if (start && r.createdDate < start) continue;
        if (end && r.createdDate > end) continue;
        sum += r.amountValue;
      }
      return sum;
    };

    const earningsMix = computeDashboardEarningsMix(
      parsedRows.map((r) => ({
        transaction_type: r.transaction_type,
        amount: r.amountValue,
        net: r.netValue,
        booking_id: r.booking_id,
        product_order_id: r.product_order_id,
        description: r.descriptionText,
      })),
    );
    const {
      serviceEarningsTotal,
      bookingEarningsTotal,
      productOrderEarningsTotal,
      additionalChargeEarningsTotal,
      otherEarningsTotal,
    } = earningsMix;
    const providerEarningsRows = parsedRows.filter((r) => r.transaction_type === "provider_earnings");
    const providerEarningsTotal = providerEarningsRows.reduce((sum, r) => sum + r.netValue, 0);

    // Recognized revenue (single source of truth): provider_earnings + tips + travel +
    // cancellation fees + walk-in add-ons. See lib/reports/provider-revenue-semantics.ts.
    const recognizedRevenueTotal = recognizedRevenue(parsedRows);
    const totalRevenue = recognizedRevenueTotal;

    // Gross sales (for reporting) — does not change provider net directly here.
    const giftCardSalesTotal = sumAmount(["gift_card_sale"]);
    const membershipSalesTotal = sumAmount(["membership_sale"]);

    const revenuePeriodEnds = getDashboardRecognizedRevenueBounds({
      timezone: providerTz,
      businessNow,
      startOfWeekLocal,
    });

    // Travel posts as its own ledger row with amount === net (excluded from provider_earnings);
    // amount and net are interchangeable here.
    const travelFeesToday = sumAmount(
      ["travel_fee"],
      startOfToday,
      revenuePeriodEnds.endOfToday,
    );
    const travelFeesThisMonth = sumAmount(
      ["travel_fee"],
      startOfMonth,
      revenuePeriodEnds.endOfMonth,
    );
    const travelFeesLastMonth = sumAmount(["travel_fee"], startOfLastMonth, endOfLastMonth);
    const travelFeesTotal = sumAmount(["travel_fee"]);

    // Refunds: match finance API — sum |net| on provider-affecting `refund` component
    // rows plus legacy negative provider_earnings (F10). The trigger splits a refund
    // into per-component rows; platform fee/commission, tax, discount contras and
    // wallet/gift tender legs are not provider losses and are excluded here.
    let refundsTotal = 0;
    for (const r of parsedRows) {
      if (r.transaction_type === "refund") {
        if (isProviderEarningsRefundComponent(r.refund_component)) {
          refundsTotal += Math.abs(r.netValue);
        }
        continue;
      }
      if (r.transaction_type === "provider_earnings" && r.netValue < 0) {
        refundsTotal += Math.abs(r.netValue);
      }
    }

    const tipsTotal = sumAmount(["tip"]);
    const tipsThisMonth = sumAmount(["tip"], startOfMonth);

    const EXPENSE_TYPES = ["provider_subscription_payment", "provider_ads_payment", "provider_expense"];
    const expensesTotal = sumAmount(EXPENSE_TYPES);
    const expensesThisMonth = sumAmount(EXPENSE_TYPES, startOfMonth);

    let platformFeesDeducted = 0;
    let platformCommissionPaid = 0;
    for (const r of parsedRows) {
      if (r.transaction_type === "platform_fee" || r.transaction_type === "service_fee") {
        platformFeesDeducted += Math.abs(r.netValue);
      } else if (r.transaction_type === "payment") {
        platformCommissionPaid += Math.abs(r.netValue);
      }
    }

    const ledgerRowsForRange = parsedRows.map((r) => ({
      transaction_type: r.transaction_type,
      amount: r.amountValue,
      net: r.netValue,
      created_at: r.created_at,
    }));

    const sumRecognizedRevenue = (start?: Date, end?: Date) =>
      recognizedRevenueInRange(ledgerRowsForRange, { start, end });

    // Snapshot RPC (when enabled) sums the FULL ledger in Postgres; the Node path is
    // bounded by MAX_FINANCE_TRANSACTIONS.
    const revenueToday = snapshot
      ? snapshot.revenue.today
      : sumRecognizedRevenue(startOfToday, revenuePeriodEnds.endOfToday);
    const revenueThisWeek = snapshot
      ? snapshot.revenue.this_week
      : sumRecognizedRevenue(startOfWeek, revenuePeriodEnds.endOfWeek);
    const revenueThisMonth = snapshot
      ? snapshot.revenue.this_month
      : sumRecognizedRevenue(startOfMonth, revenuePeriodEnds.endOfMonth);
    const revenueLastMonth = snapshot
      ? snapshot.revenue.last_month
      : sumRecognizedRevenue(startOfLastMonth, endOfLastMonth);

    const todayYmd = formatDateYmd(businessNow, providerTz);
    const weekStartYmd = formatDateYmd(startOfWeekLocal, providerTz);
    const monthStartYmd = format(
      new Date(businessNow.getFullYear(), businessNow.getMonth(), 1),
      "yyyy-MM-dd",
    );
    const retailTakings = await withDashboardFallback("retail_takings", EMPTY_RETAIL_TAKINGS, () =>
      getProviderRetailTakingsSummary(supabaseAdmin, {
        providerId,
        timezone: providerTz,
        todayYmd,
        weekStartYmd,
        monthStartYmd,
        locationId,
      }),
    );

    const revenueGrowth =
      revenueLastMonth !== 0
        ? Math.round(((revenueThisMonth - revenueLastMonth) / Math.abs(revenueLastMonth)) * 100)
        : 0;

    const revenueYesterday = snapshot
      ? snapshot.revenue.yesterday
      : sumRecognizedRevenue(startOfYesterday, endOfYesterday);
    const revenuePriorWeek = snapshot
      ? snapshot.revenue.prior_week
      : sumRecognizedRevenue(startOfPriorWeek, endOfPriorWeek);
    const revenuePriorMonthMtd = snapshot
      ? snapshot.revenue.prior_month
      : sumRecognizedRevenue(startOfPriorMonthMtd, endOfPriorMonthMtd);

    const { period_breakdown, period_comparison } = buildDashboardPeriodBreakdown({
      parsedRows,
      bookings: allBookings,
      windows: {
        today: { start: startOfToday, end: revenuePeriodEnds.endOfToday },
        this_week: { start: startOfWeek, end: revenuePeriodEnds.endOfWeek },
        this_month: { start: startOfMonth, end: revenuePeriodEnds.endOfMonth },
        yesterday: { start: startOfYesterday, end: endOfYesterday },
        prior_week: { start: startOfPriorWeek, end: endOfPriorWeek },
        prior_month: { start: startOfPriorMonthMtd, end: endOfPriorMonthMtd },
      },
      revenue: {
        today: revenueToday,
        this_week: revenueThisWeek,
        this_month: revenueThisMonth,
        yesterday: revenueYesterday,
        prior_week: revenuePriorWeek,
        prior_month: revenuePriorMonthMtd,
      },
      appointments: {
        today: upcomingBookingsToday,
        this_week: bookingsScheduledThisWeek,
        this_month: bookingsScheduledThisMonth,
        yesterday: appointmentsYesterday,
        prior_week: appointmentsPriorWeek,
        prior_month: appointmentsPriorMonth,
      },
      retail: {
        today: retailTakings.today,
        this_week: retailTakings.this_week,
        this_month: retailTakings.this_month,
      },
    });

    // Keep dashboard available balance aligned with finance/payout APIs:
    // apply hold-days and exclude direct walk-in earnings that are not held by platform.
    const providerTenantId =
      (providerData as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    const scopedSettings = await withDashboardFallback(
      "payout_settings",
      { data: null, source: "none" as const },
      () =>
        fetchScopedSingle<Record<string, unknown>>({
          supabase: supabaseAdmin as any,
          table: "platform_settings",
          tenantId: providerTenantId ?? "",
          select: "settings",
          apply: (q) => q.eq("is_active", true),
          orderBy: { column: "updated_at", ascending: false },
        }),
    );
    const payoutSettings = ((scopedSettings.data as { settings?: Record<string, unknown> } | null)?.settings as any)
      ?.payouts ?? {};
    const holdDays = Number(payoutSettings.payout_hold_days ?? 0);
    const { availableBalance, pendingPayoutsSum, rawBalance, hasNegativeBalance } =
      await withDashboardFallback("payout_balance", EMPTY_PAYOUT_BALANCE, () =>
        getAvailablePayoutBalance(supabaseAdmin as any, providerId, {
          holdDays,
          tenantId: providerTenantId,
        }),
      );
    
    // Calculate pending payments (unpaid bookings)
    const buildUnpaidQuery = (orFilter: string | null) => {
      let q = supabaseAdmin
        .from("bookings")
        .select("total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status")
        .eq("provider_id", providerId)
        .in("payment_status", ["pending", "partially_paid"])
        .not("status", "in", "(cancelled,no_show)");
      if (orFilter) q = q.or(orFilter);
      return q;
    };

    const unpaidBookings = await withDashboardFallback("unpaid_bookings", [] as unknown[], async () => {
      const loadUnpaid = async (orFilter: string | null) =>
        fetchAllPaged(async (from, to) => {
          const { data, error } = await buildUnpaidQuery(orFilter)
            .order("created_at", { ascending: true })
            .range(from, to);
          return { data, error };
        }, 20_000);

      if (!locationId) return loadUnpaid(null);
      for (const filter of locationFilters) {
        try {
          return await loadUnpaid(filter);
        } catch (err) {
          console.warn("[dashboard] unpaid bookings location filter failed, retrying simpler filter:", err);
        }
      }
      return loadUnpaid(null);
    });

    const pendingPaymentsAmount =
      unpaidBookings?.reduce((sum, b) => {
        const total = Number((b as { total_amount?: number }).total_amount ?? 0);
        const paid = Number((b as { total_paid?: number }).total_paid ?? 0);
        const refunded = Number((b as { total_refunded?: number }).total_refunded ?? 0);
        const wallet = Number((b as { wallet_amount?: number }).wallet_amount ?? 0);
        const gift = Number((b as { gift_card_amount?: number }).gift_card_amount ?? 0);
        const effectivePaid = Math.max(0, paid - refunded);
        const outstanding = Math.max(0, total - effectivePaid - wallet - gift);
        return sum + outstanding;
      }, 0) || 0;
    const pendingPaymentsCount = unpaidBookings?.length || 0;

    let insights:
      | {
          weekly_revenue: Array<{ day: string; revenue: number }>;
          top_services: Array<{ service_name: string; booking_count: number; total_revenue: number }>;
          recent_activity: Array<{
            id: string;
            type: string;
            description: string;
            created_at: string;
            data?: {
              booking_id?: string;
              product_order_id?: string;
              client_name?: string;
              amount?: number;
            };
          }>;
          today_bookings: Array<{
            id: string;
            booking_number: string;
            status: string;
            scheduled_at: string;
            total_amount: number;
            currency: string;
            location_type: string;
            services: Array<{
              name?: string;
              offering_name?: string;
              duration_minutes: number;
              staff_name: string | null;
              guest_name?: string | null;
            }>;
            customers: { full_name: string; phone: string } | null;
            is_group_booking?: boolean;
            group_booking_id?: string | null;
            group_booking_ref?: string | null;
            package_name?: string | null;
            products?: Array<{ product_name?: string; quantity?: number }>;
          }>;
          upcoming_bookings: Array<{
            id: string;
            booking_number: string;
            status: string;
            scheduled_at: string;
            total_amount: number;
            currency: string;
            location_type: string;
            services: Array<{
              name?: string;
              offering_name?: string;
              duration_minutes: number;
              staff_name: string | null;
              guest_name?: string | null;
            }>;
            customers: { full_name: string; phone: string } | null;
            is_group_booking?: boolean;
            group_booking_id?: string | null;
            group_booking_ref?: string | null;
            package_name?: string | null;
            products?: Array<{ product_name?: string; quantity?: number }>;
          }>;
          basis?: {
            upcoming?: string;
            activity?: string | null;
            activity_window?: string | null;
          };
        }
      | null = null;

    let bookingEligibility:
      | {
          can_accept_online_bookings: boolean;
          booking_limit_message: string | null;
        }
      | null = null;

    // Truth guard for the money card: completed online-gateway payments today
    // that have no ledger `payment` row yet (Part A reconcile cron will post them).
    const unrecognizedPaymentsToday = await countUnrecognizedPaymentsToday(
      supabaseAdmin,
      providerId,
      providerTz,
    );

    if (includeInsights) {
      try {
      const chartStartYmd = addDaysToYmd(todayYmd, -6);
      const chartBounds = dateRangeBoundsUtc(chartStartYmd, todayYmd, providerTz);
      const revenueByDay = new Map<string, number>();
      for (let i = 0; i < 7; i += 1) {
        revenueByDay.set(addDaysToYmd(chartStartYmd, i), 0);
      }
      for (const r of parsedRows) {
        const createdAt = r.createdDate;
        if (createdAt < new Date(chartBounds.fromIso) || createdAt > now) continue;
        const key = formatInTz(createdAt, "yyyy-MM-dd", providerTz);
        if (!revenueByDay.has(key)) continue;
        revenueByDay.set(
          key,
          (revenueByDay.get(key) ?? 0) +
            recognizedRevenueInRange(
              [
                {
                  transaction_type: r.transaction_type,
                  amount: r.amountValue,
                  net: r.netValue,
                },
              ],
              {},
            ),
        );
      }
      const weeklyRevenue = Array.from(revenueByDay.entries()).map(([day, revenue]) => ({ day, revenue }));

      const topServicesFrom = subDays(startOfToday, 29);
      const topServicesPerf = await buildServiceLedgerPerformance(
        supabaseAdmin,
        providerId,
        topServicesFrom,
        now,
        locationId,
        providerTz,
        { status: "completed" },
      );
      const topServices = topServicesPerf
        .map((s) => ({
          service_name: s.serviceName,
          booking_count: s.bookingCount,
          total_revenue: s.revenue,
        }))
        .slice(0, 5);

      const { bookings: upcomingBookings, basis: upcomingBasis } =
        await fetchUpcomingBookingsForDashboard(supabaseAdmin, {
          providerId,
          timezone: providerTz,
          locationId,
          limit: 12,
        });

      const todayBounds = dateRangeBoundsUtc(todayYmd, todayYmd, providerTz);
      const todayBookings = upcomingBookings
        .filter((b) => {
          const when = new Date(b.scheduled_at);
          return (
            when >= new Date(todayBounds.fromIso) && when <= new Date(todayBounds.toIso)
          );
        })
        .slice(0, 8);

      const activityPayload = await buildProviderActivityFeed(supabaseAdmin, providerId, {
        timezone: providerTz,
        locationId,
        limit: 10,
      });
      const recentActivity = activityPayload.activities;
      const activityBasis = activityPayload.basis;
      const activityWindow = activityPayload.window;

      const bookingLimit = await checkBookingLimit(providerId, supabaseAdmin);
      bookingEligibility = {
        can_accept_online_bookings: bookingLimit.canProceed,
        booking_limit_message: bookingLimit.canProceed
          ? null
          : formatProviderPortalLimitMessage(bookingLimit, "Subscription"),
      };

      insights = {
        weekly_revenue: weeklyRevenue,
        top_services: topServices,
        recent_activity: recentActivity,
        today_bookings: todayBookings,
        upcoming_bookings: upcomingBookings,
        basis: {
          upcoming: upcomingBasis.upcoming || UPCOMING_BOOKINGS_BASIS,
          activity: activityBasis?.window ?? activityBasis?.bookings ?? null,
          activity_window: activityWindow
            ? `${activityWindow.fromYmd}–${activityWindow.toYmd}`
            : null,
        },
      };
      } catch (insightsErr) {
        console.warn("[dashboard] insights failed:", insightsErr);
        insights = null;
        bookingEligibility = null;
      }
    }
    
    // Calculate performance metrics
    const terminalBookings = completedBookings + cancelledBookings + noShowBookings;
    const completionRate = terminalBookings > 0 ? (completedBookings / terminalBookings) * 100 : 0;
    const noShowRate = terminalBookings > 0 ? (noShowBookings / terminalBookings) * 100 : 0;

    const gamification = await withDashboardFallback(
      "gamification",
      {
        total_points: 0,
        lifetime_points: 0,
        current_tier_points: 0,
        current_badge: null,
        badge_earned_at: null,
        badge_expires_at: null,
        milestones: [],
        recent_transactions: [],
        progress_to_next_badge: null,
      },
      async () => {
        const healSignalsInitial = await fetchProviderGamificationHealSignals(supabaseAdmin, providerId);
        const { data: pointsRowPeek } = await supabaseAdmin
          .from("provider_points")
          .select("id")
          .eq("provider_id", providerId)
          .maybeSingle();
        await syncProviderGamification(supabaseAdmin, providerId, {
          ...healSignalsInitial,
          hasProviderPointsRow: !!pointsRowPeek,
        });

        const { data: gamificationData } = await supabaseAdmin
          .from("provider_points")
          .select(PROVIDER_POINTS_SELECT)
          .eq("provider_id", providerId)
          .maybeSingle();

        const { data: milestones } = await supabaseAdmin
          .from("provider_milestones")
          .select("milestone_type, achieved_at")
          .eq("provider_id", providerId)
          .order("achieved_at", { ascending: false })
          .limit(10);

        const { data: recentTransactions } = await supabaseAdmin
          .from("provider_point_transactions")
          .select("points, source, description, created_at")
          .eq("provider_id", providerId)
          .order("created_at", { ascending: false })
          .limit(10);

        const { data: allBadges } = await supabaseAdmin
          .from("provider_badges")
          .select("id, name, slug, tier, color, requirements, benefits, description, icon_url")
          .eq("is_active", true)
          .order("tier", { ascending: true });

        const badge = resolveJoinedBadge(gamificationData?.provider_badges);
        const currentPoints = gamificationData?.total_points ?? 0;
        const progressToNextBadge = buildProgressToNextBadge(allBadges, badge, currentPoints);

        return {
          total_points: currentPoints,
          lifetime_points: gamificationData?.lifetime_points ?? 0,
          current_tier_points: gamificationData?.current_tier_points ?? 0,
          current_badge: badge
            ? {
                id: badge.id,
                name: badge.name,
                slug: badge.slug,
                description: badge.description,
                icon_url: badge.icon_url,
                tier: badge.tier,
                color: badge.color,
                requirements: badge.requirements,
                benefits: badge.benefits,
              }
            : null,
          badge_earned_at: gamificationData?.badge_earned_at ?? null,
          badge_expires_at: gamificationData?.badge_expires_at ?? null,
          milestones: milestones || [],
          recent_transactions: recentTransactions || [],
          progress_to_next_badge: progressToNextBadge,
        };
      },
    );

    const payload = {
      // Booking counts
      total_bookings: totalBookings,
      active_bookings: activeBookings,
      confirmed_bookings: confirmedBookings,
      completed_bookings: completedBookings,
      cancelled_bookings: cancelledBookings,
      no_show_bookings: noShowBookings,
      pending_bookings: pendingBookings,
      
      // Location type breakdown
      at_home_bookings: atHomeBookings,
      at_salon_bookings: atSalonBookings,
      at_home_completed: atHomeCompleted,
      at_salon_completed: atSalonCompleted,
      at_home_confirmed: atHomeConfirmed,
      at_salon_confirmed: atSalonConfirmed,
      at_home_pending: atHomePending,
      at_salon_pending: atSalonPending,
      at_home_cancelled: atHomeCancelled,
      at_salon_cancelled: atSalonCancelled,
      at_home_no_show: atHomeNoShow,
      at_salon_no_show: atSalonNoShow,
      
      // Revenue - Current period (primary)
      revenue_today: revenueToday,
      revenue_this_week: revenueThisWeek,
      revenue_this_month: revenueThisMonth,
      revenue_growth: revenueGrowth,
      
      // Revenue - Lifetime (secondary)
      lifetime_revenue: totalRevenue,
      
      // Financial status
      available_balance: availableBalance,
      pending_payout_queue: pendingPayoutsSum,
      payout_hold_days: holdDays,
      pending_payments_amount: pendingPaymentsAmount,
      pending_payments_count: pendingPaymentsCount,
      
      // Revenue streams
      service_earnings_total: serviceEarningsTotal,
      booking_earnings_total: bookingEarningsTotal,
      product_order_earnings_total: productOrderEarningsTotal,
      product_order_earnings_platform_total: productOrderEarningsTotal,
      product_order_retail_total: retailTakings.lifetime.amount,
      retail_sales_today: retailTakings.today.amount,
      retail_sales_this_week: retailTakings.this_week.amount,
      retail_sales_this_month: retailTakings.this_month.amount,
      retail_sales_count_today: retailTakings.today.count,
      retail_sales_count_this_week: retailTakings.this_week.count,
      retail_sales_count_this_month: retailTakings.this_month.count,
      additional_charge_earnings_total: additionalChargeEarningsTotal,
      other_earnings_total: otherEarningsTotal,
      recognized_earnings_total: recognizedRevenueTotal,
      tips_total: tipsTotal,
      tips_this_month: tipsThisMonth,
      gift_card_sales_total: giftCardSalesTotal,
      membership_sales_total: membershipSalesTotal,
      refunds_total: Math.abs(refundsTotal),

      /** F11: earnings-mix lines are all-time ledger sums; revenue_today/week/month use recognition dates. */
      metrics_time_basis: "lifetime_all_time",
      earnings_mix_time_basis:
        "All-time ledger totals. Revenue chips use recognition date in your business timezone.",
      unrecognized_payments_today: unrecognizedPaymentsToday,
      raw_payout_balance: rawBalance,
      has_negative_payout_balance: hasNegativeBalance,
      balance_owed_to_platform: hasNegativeBalance ? Math.abs(rawBalance) : 0,

      // Customer-paid platform fees (ledger) vs %-commission on payment rows (platform take).
      platform_fees_deducted: platformFeesDeducted,
      platform_commission_paid: platformCommissionPaid,
      /** @deprecated misleading name — use platform_commission_paid */
      platform_fees_paid: platformCommissionPaid,
      expenses_total: expensesTotal,
      expenses_this_month: expensesThisMonth,
      
      // Travel fees breakdown
      travel_fees_total: travelFeesTotal,
      travel_fees_today: travelFeesToday,
      travel_fees_this_month: travelFeesThisMonth,
      travel_fees_last_month: travelFeesLastMonth,
      
      // Performance metrics
      completion_rate: completionRate,
      no_show_rate: noShowRate,
      average_rating: providerData?.rating_average || 0,
      total_reviews: providerData?.review_count || 0,
      
      // Schedule (by scheduled_at, not created_at)
      appointments_today: upcomingBookingsToday,
      appointments_this_week: bookingsScheduledThisWeek,
      appointments_this_month: bookingsScheduledThisMonth,
      
      // Gamification
      gamification: gamification,

      // Provider profile summary (rating, badge, service types, distance) for identity strip
      provider_profile: {
        supports_house_calls: supportsHouseCalls,
        supports_salon: supportsSalon,
        max_service_distance_km: maxServiceDistanceKm,
        is_distance_filter_enabled: isDistanceFilterEnabled,
      },
      dashboard_bundle_version: includeInsights ? 1 : 0,
      /** True when booking aggregates hit MAX_DASHBOARD_BOOKINGS — status counts may be incomplete. */
      bookings_truncated: bookingsTruncated,
      /** True when ledger rows hit MAX_FINANCE_TRANSACTIONS — lifetime totals may be incomplete. */
      ledger_truncated: ledgerRows.length >= MAX_FINANCE_TRANSACTIONS,
      period_breakdown,
      period_comparison,
      insights,
      booking_eligibility: bookingEligibility,
    };

    dashboardResponseCache.set(cacheKey, {
      expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
      data: payload,
    });
    pruneDashboardResponseCache(Date.now());

    const response = successResponse(payload);

    // Add cache headers for faster subsequent requests (5 seconds)
    response.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=10');
    
    return response;
  } catch (error) {
    // Log the full error object for better debugging
    console.error('Error loading dashboard:', error);
    return handleApiError(error, 'Failed to load dashboard data');
  }
}
