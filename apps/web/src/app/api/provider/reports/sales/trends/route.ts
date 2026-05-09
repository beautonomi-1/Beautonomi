import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subDays, subMonths, subYears, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  dateRangeBoundsUtc,
  endOfWeekInTz,
  formatDateYmd,
  startOfWeekInTz,
} from "@/lib/dates/provider-tz";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { LEDGER_FULL_PROVIDER_NET_TYPES } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateKey } from "@/lib/reports/provider-report-utils";

function trendBucketKey(ymd: string, granularity: string, tz: string): string {
  const anchor = new Date(`${ymd}T12:00:00.000Z`);
  switch (granularity) {
    case "day":
      return ymd;
    case "week":
      return formatDateYmd(startOfWeekInTz(anchor, tz, 1), tz);
    case "month":
      return ymd.slice(0, 7);
    case "year":
      return ymd.slice(0, 4);
    default:
      return ymd;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "month";
    const locationId = searchParams.get("location_id") || undefined;

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;
    const todayYmd = formatDateYmd(new Date(), tz);
    const zNow = toZonedTime(new Date(), tz);

    let fromYmd: string;
    let toYmd: string;

    switch (period) {
      case "day":
        fromYmd = formatDateYmd(subDays(zNow, 30), tz);
        toYmd = todayYmd;
        break;
      case "week": {
        const anchorUtc = subDays(zNow, 12 * 7);
        fromYmd = formatDateYmd(startOfWeekInTz(anchorUtc, tz, 1), tz);
        toYmd = formatDateYmd(endOfWeekInTz(new Date(), tz, 1), tz);
        break;
      }
      case "month":
        fromYmd = formatDateYmd(startOfMonth(subMonths(zNow, 12)), tz);
        toYmd = formatDateYmd(endOfMonth(zNow), tz);
        break;
      case "year":
        fromYmd = formatDateYmd(startOfYear(subYears(zNow, 3)), tz);
        toYmd = formatDateYmd(endOfYear(zNow), tz);
        break;
      default:
        fromYmd = formatDateYmd(subDays(zNow, 30), tz);
        toYmd = todayYmd;
    }

    const range = dateRangeBoundsUtc(fromYmd, toYmd, tz);
    const fromDate = new Date(range.fromIso);
    const toDate = new Date(range.toIso);

    const ledgerOpts = {
      transactionTypes: LEDGER_FULL_PROVIDER_NET_TYPES,
      timezone: tz,
    };

    const { revenueByDate } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId ?? null,
      ledgerOpts,
    );

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .order("scheduled_at", { ascending: true });

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      return handleApiError(new Error("Failed to fetch bookings"), "BOOKINGS_FETCH_ERROR", 500);
    }

    const trendMap = new Map<string, { revenue: number; bookings: number }>();

    revenueByDate.forEach((revenue, dateStr) => {
      const key = trendBucketKey(dateStr, period, tz);
      const existing = trendMap.get(key) || { revenue: 0, bookings: 0 };
      existing.revenue += revenue;
      trendMap.set(key, existing);
    });

    bookings?.forEach((booking) => {
      const ymd = reportDateKey(new Date(booking.scheduled_at), tz);
      const key = trendBucketKey(ymd, period, tz);
      const existing = trendMap.get(key) || { revenue: 0, bookings: 0 };
      existing.bookings += 1;
      trendMap.set(key, existing);
    });

    const trends = Array.from(trendMap.entries())
      .map(([bucketPeriod, row]) => ({ period: bucketPeriod, revenue: row.revenue, bookings: row.bookings }))
      .sort((a, b) => a.period.localeCompare(b.period));

    let revenueGrowth = 0;
    let bookingsGrowth = 0;
    let priorBucketComparison:
      | {
          revenueChangePct: number;
          bookingsChangePct: number;
          previousPeriod: string;
          currentPeriod: string;
        }
      | undefined;

    if (trends.length >= 2) {
      const current = trends[trends.length - 1];
      const previous = trends[trends.length - 2];
      revenueGrowth =
        previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : 0;
      bookingsGrowth =
        previous.bookings > 0 ? ((current.bookings - previous.bookings) / previous.bookings) * 100 : 0;
      priorBucketComparison = {
        revenueChangePct: revenueGrowth,
        bookingsChangePct: bookingsGrowth,
        previousPeriod: previous.period,
        currentPeriod: current.period,
      };
    }

    const totalRevenue = trends.reduce((sum, t) => sum + t.revenue, 0);
    const totalBookings = trends.reduce((sum, t) => sum + t.bookings, 0);
    const averageLedgerPerBucket = trends.length > 0 ? totalRevenue / trends.length : 0;

    const basisNote =
      "Ledger amounts sum finance_transactions net for provider_earnings, travel_fee, and tip — grouped by recognition date in your timezone. Retail/product ledger rows contribute to revenue but not to booking counts. Appointment counts use scheduled dates (excluding cancelled & no-show), grouped into the same buckets — so revenue and visits are on different business bases and will not always move together. Change % compares only the last two buckets, not year-over-year.";

    const reportBasis =
      `${fromYmd}–${toYmd} (${tz}). Ledger net by recognition date vs scheduled visits (excl. cancelled/no-show). Growth columns compare only the final two buckets.`;

    const basis = {
      ledger:
        "Buckets aggregate provider_earnings + travel_fee + tip net by calendar bucket (finance_transactions.created_at).",
      visits: "Bookings use scheduled_at into the same bucket keys (cancelled & no_show excluded).",
      retail:
        "Product-order ledger increases revenue in a bucket without increasing visit counts.",
      growth: "revenueGrowth / bookingsGrowth are last bucket vs prior bucket only.",
      averageRevenue: "total ledger in window ÷ number of buckets — not per visit.",
    };

    return successResponse({
      period,
      trends,
      totalRevenue,
      totalBookings,
      /** Mean ledger net per trend bucket (not per booking). */
      averageRevenue: averageLedgerPerBucket,
      revenueGrowth,
      bookingsGrowth,
      priorBucketComparison,
      dateRange: { fromYmd, toYmd, timezone: tz },
      ledgerTransactionTypes: [...LEDGER_FULL_PROVIDER_NET_TYPES],
      basisNote,
      basis,
      reportBasis,
      report_basis: reportBasis,
    });
  } catch (error) {
    return handleApiError(error, "REVENUE_TRENDS_ERROR", 500);
  }
}
