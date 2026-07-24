import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { dateRangeBoundsUtc } from "@/lib/dates/provider-tz";
import {
  getProviderReportContext,
  type LedgerLocationAttributionSummary,
} from "@/lib/reports/provider-report-utils";
import { getRecordedTakingsForRange } from "@/lib/reports/recorded-takings";

export interface EndOfDayResponse {
  date: string;
  /** Provider IANA timezone used for the calendar day bounds. */
  timezone: string;
  reportBasis: string;
  byPaymentMethod: Record<string, number>;
  bookingPaymentsTotal: number;
  walletTotal: number;
  salesTotal: number;
  tipsTotal: number;
  cashbackTotal: number;
  cancellationFeesTotal: number;
  total: number;
  /** Distinct bookings that contributed via booking_payments and/or wallet takings in range. */
  bookingCount: number;
  salesCount: number;
  note: string;
  locationAttribution?: LedgerLocationAttributionSummary;
}

/**
 * GET /api/provider/reports/end-of-day
 * Aggregates takings by payment method for a single day from booking_payments and sales.
 * Query: date (YYYY-MM-DD), location_id (optional).
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const dateStr = searchParams.get("date");
    const locationId = searchParams.get("location_id") || undefined;

    if (!dateStr) {
      return errorResponse("Query parameter 'date' (YYYY-MM-DD) is required", "VALIDATION_ERROR", 400);
    }
    const ymd = dateStr.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      return errorResponse("Invalid date format. Use YYYY-MM-DD.", "VALIDATION_ERROR", 400);
    }
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromIso: dayStart, toIso: dayEnd } = dateRangeBoundsUtc(ymd, ymd, reportContext.timezone);

    const rt = await getRecordedTakingsForRange(supabaseAdmin, {
      providerId,
      rangeStartIso: dayStart,
      rangeEndIso: dayEnd,
      locationId,
    });

    const response: EndOfDayResponse = {
      date: dateStr,
      timezone: reportContext.timezone,
      reportBasis:
        "Cash-register / till-style totals for the selected calendar day in the provider timezone. " +
        "Booking payments use completed booking_payments by created_at. Wallet bucket adds only the wallet share not already covered by those rows (avoids double-counting split card+wallet). " +
        "Walk-in retail uses paid walk-in product_orders by paid_at; legacy sales table uses completed sale_date. " +
        "Tips and cancellation fees come from finance_transactions settlement timestamps in range. " +
        "This is not the same as payoutable ledger balance — use payout earnings for that.",
      byPaymentMethod: rt.byPaymentMethod,
      bookingPaymentsTotal: rt.bookingPaymentsTotal,
      walletTotal: rt.walletTotal,
      salesTotal: rt.salesTotal,
      tipsTotal: rt.tipsTotal,
      cashbackTotal: rt.cashbackTotal,
      cancellationFeesTotal: rt.cancellationFeesTotal,
      total: rt.totalRecorded,
      bookingCount: rt.bookingCount,
      salesCount: rt.salesCount,
      note: `Recorded takings by capture date (see reportBasis). Wallet rows from bookings use appointment scheduled date to select candidates; amounts are reconciled against booking_payments. ${rt.locationAttribution?.note ?? ""}`.trim(),
      locationAttribution: rt.locationAttribution,
    };

    return successResponse(response);
  } catch (error) {
    return handleApiError(error, "Failed to generate end-of-day report");
  }
}
