import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dateRangeBoundsUtc, formatDateYmd, formatInTz } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { fetchAllPaged } from "@/lib/provider-ops/postgrest-unbounded";

type BookingLite = { customer_id: string | null; scheduled_at: string };

async function fetchCompletedBookings(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  locationId: string | undefined,
  fromIso: string,
  toIso: string,
): Promise<BookingLite[]> {
  return fetchAllPaged<BookingLite>(async (from, to) => {
    let q = supabaseAdmin
      .from("bookings")
      .select("id, customer_id, scheduled_at")
      .eq("provider_id", providerId)
      .eq("status", "completed")
      .gte("scheduled_at", fromIso)
      .lte("scheduled_at", toIso)
      .order("id", { ascending: true });
    if (locationId) q = q.eq("location_id", locationId);
    const { data, error } = await q.range(from, to);
    return { data: data as BookingLite[] | null, error };
  });
}

export type ClientRetentionPeriodRow = {
  period: string;
  /** Share of prior-period clients who also appear in this period (completed visits). */
  retentionRate: number;
  /** Distinct customers with ≥1 completed visit in this bucket. */
  clients: number;
  /** Distinct customers with ≥1 completed visit in the immediately previous bucket. */
  clientsInPriorPeriod: number;
  /** Customers appearing in both this period and the prior bucket. */
  returnedFromPriorPeriod: number;
};

export type ClientRetentionResponse = {
  totalClients: number;
  /** Clients with exactly one completed visit in the analysis window. */
  newClients: number;
  /** Clients with two or more completed visits in the analysis window. */
  returningClients: number;
  /** Share of distinct clients who had 2+ completed visits in the window (= returningClients / totalClients). */
  overallRetentionRate: number;
  averageVisitsPerClient: number;
  retentionByPeriod: ClientRetentionPeriodRow[];
  periodGranularity: "month" | "quarter" | "year";
  analysisFromYmd: string;
  analysisToYmd: string;
  monthsOfHistory: number;
  basisNote: string;
  reportBasis: string;
  timezone: string;
};

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const periodParam = (searchParams.get("period") || "month") as "month" | "quarter" | "year";
    const locationId = searchParams.get("location_id") || undefined;

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const timezone = reportContext.timezone;
    const todayYmd = formatDateYmd(new Date(), timezone);
    const zNow = toZonedTime(new Date(), timezone);
    const monthsBack =
      periodParam === "quarter" ? 4 : periodParam === "year" ? 24 : 12;
    const fromYmd = formatDateYmd(subMonths(zNow, monthsBack), timezone);
    const { fromIso, toIso } = dateRangeBoundsUtc(fromYmd, todayYmd, timezone);
    const fromDate = new Date(fromIso);
    const toDate = new Date(toIso);

    const bookings = await fetchCompletedBookings(supabaseAdmin, providerId, locationId, fromDate.toISOString(), toDate.toISOString());

    const customerBookings = new Map<string, Date[]>();
    for (const booking of bookings) {
      if (!booking.customer_id) continue;
      const dates = customerBookings.get(booking.customer_id) || [];
      dates.push(new Date(booking.scheduled_at));
      customerBookings.set(booking.customer_id, dates);
    }

    const totalClients = customerBookings.size;
    let returningClients = 0;
    let newClients = 0;
    customerBookings.forEach((dates) => {
      if (dates.length > 1) returningClients += 1;
      else newClients += 1;
    });

    const periodMap = new Map<string, Set<string>>();
    for (const booking of bookings) {
      if (!booking.customer_id) continue;
      const date = new Date(booking.scheduled_at);
      let periodKey: string;

      if (periodParam === "month") {
        periodKey = formatInTz(date, "yyyy-MM", timezone);
      } else if (periodParam === "quarter") {
        const y = formatInTz(date, "yyyy", timezone);
        const m = Number(formatInTz(date, "M", timezone));
        const quarter = Math.floor((m - 1) / 3) + 1;
        periodKey = `${y}-Q${quarter}`;
      } else {
        periodKey = formatInTz(date, "yyyy", timezone);
      }

      const clients = periodMap.get(periodKey) || new Set<string>();
      clients.add(booking.customer_id);
      periodMap.set(periodKey, clients);
    }

    const periods = Array.from(periodMap.keys()).sort();
    const retentionByPeriod: ClientRetentionPeriodRow[] = [];

    periods.forEach((currentPeriod, index) => {
      if (index === 0) return;

      const previousPeriod = periods[index - 1]!;
      const currentClients = periodMap.get(currentPeriod) || new Set<string>();
      const previousClients = periodMap.get(previousPeriod) || new Set<string>();

      const returnedClients = [...currentClients].filter((c) => previousClients.has(c));
      const retentionRate =
        previousClients.size > 0
          ? Math.round((returnedClients.length / previousClients.size) * 1000) / 10
          : 0;

      retentionByPeriod.push({
        period: currentPeriod,
        retentionRate,
        clients: currentClients.size,
        clientsInPriorPeriod: previousClients.size,
        returnedFromPriorPeriod: returnedClients.length,
      });
    });

    const overallRetentionRate =
      totalClients > 0 ? Math.round((returningClients / totalClients) * 1000) / 10 : 0;

    let totalVisits = 0;
    customerBookings.forEach((dates) => {
      totalVisits += dates.length;
    });
    const averageVisitsPerClient =
      totalClients > 0 ? Math.round((totalVisits / totalClients) * 100) / 100 : 0;

    const locPhrase = locationId
      ? "Bookings are restricted to the selected location."
      : "Bookings include all locations for this provider.";

    const basisNote = [
      `Timezone: ${timezone}. Analysis window: ${fromYmd} through ${todayYmd} (inclusive civil dates), bounded by scheduled appointment times converted to UTC.`,
      `Only bookings with status completed are included (pending, cancelled, or no-show visits are excluded).`,
      locPhrase,
      `Distinct clients: customers with at least one completed visit in the window (guest bookings without customer_id are excluded).`,
      `"New clients" here means exactly one completed visit in this window; "returning clients" means two or more completed visits in this window — not first-ever lifetime cohort.`,
      `Overall retention % = returning clients ÷ distinct clients (repeat share of your active completed-visit base in this window).`,
      `Period-over-period retention (chart rows): for each bucket after the first, rate = (customers appearing in both this bucket and the previous bucket) ÷ (customers in the previous bucket).`,
      `Granularity: ${periodParam === "month" ? "calendar months" : periodParam === "quarter" ? "calendar quarters" : "calendar years"}; lookback spans roughly ${monthsBack} months of history.`,
    ].join(" ");

    const reportBasis =
      "Completed visits only; period retention compares each bucket to the immediately previous bucket; overall repeat share counts multi-visit clients in the analysis window.";

    return successResponse({
      totalClients,
      newClients,
      returningClients,
      overallRetentionRate,
      averageVisitsPerClient,
      retentionByPeriod,
      periodGranularity: periodParam,
      analysisFromYmd: fromYmd,
      analysisToYmd: todayYmd,
      monthsOfHistory: monthsBack,
      basisNote,
      reportBasis,
      timezone,
    } satisfies ClientRetentionResponse);
  } catch (error) {
    return handleApiError(error, "CLIENT_RETENTION_ERROR", 500);
  }
}
