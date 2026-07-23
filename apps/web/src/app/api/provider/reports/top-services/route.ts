import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { createClient } from "@supabase/supabase-js";
import { LEDGER_FULL_PROVIDER_NET_TYPES, MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { buildServiceLedgerPerformance } from "@/lib/reports/service-ledger-performance";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin, { request });

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "5", 10), 20);
    const locationId = searchParams.get("location_id");
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);

    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });

    const performance = await buildServiceLedgerPerformance(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId,
      reportContext.timezone,
      { status: "completed" },
    );

    const result = performance
      .map((row) => ({
        service_name: row.serviceName,
        offering_id: row.offeringId,
        booking_count: row.bookingCount,
        total_revenue: row.revenue,
      }))
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, limit);

    return successResponse({
      /** Primary list (also exposed as legacy array via `services` for older clients). */
      services: result,
      ledgerTransactionTypes: [...LEDGER_FULL_PROVIDER_NET_TYPES],
      basisNote:
        "Ledger net per appointment (provider_earnings + travel_fee + tip), allocated by line price share. " +
        "Completed appointments by scheduled_at in range — matches Sales by service.",
      reportBasis: "Scheduled appointment window; ledger settlement in the same period.",
    });
  } catch (error) {
    console.error("Error in top-services report:", error);
    return handleApiError(error, "Failed to generate top services report");
  }
}
