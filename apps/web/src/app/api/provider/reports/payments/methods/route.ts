import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { buildProviderPaymentMethodsReport } from "@/lib/reports/build-payment-methods-report";

/**
 * GET /api/provider/reports/payments/methods
 *
 * Customer payment method mix for the provider portal: **settlement / capture timestamps**
 * in the selected range (provider timezone), not appointment scheduled_at.
 *
 * Composes:
 * - successful `payment_transactions` in the window (gateway + internal wallet/gift settlement rows);
 * - completed `booking_payments` in the window (till / manual methods);
 * - `bookings.wallet_amount` portions when split with a gateway and not double-counted against
 *   internal wallet/gift `payment_transactions` (same rules as payment summary).
 */
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
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);

    const { data: providerTenantRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const providerTenantId = (providerTenantRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

    const searchParams = request.nextUrl.searchParams;
    const { fromDate, toDate, fromYmd, toYmd } = reportDateRangeFromParams(
      searchParams,
      reportContext.timezone,
      { defaultDays: 30, maxDays: MAX_REPORT_DAYS },
    );
    const locationId = searchParams.get("location_id") || undefined;

    const result = await buildProviderPaymentMethodsReport(supabaseAdmin, {
      providerId,
      providerTenantId,
      locationId: locationId ?? null,
      rangeStartIso: fromDate.toISOString(),
      rangeEndIso: toDate.toISOString(),
      timezone: reportContext.timezone,
      fromYmd,
      toYmd,
    });

    return successResponse({
      ...result,
      /** @deprecated use totalLineItems */
      totalPayments: result.totalLineItems,
      compatFieldsNote:
        "failedCount, failedAmount, and successRate on each method are legacy placeholders (always 0 failed / 100% success). This report only includes settled captures and completed booking_payments — not gateway failure analytics. See diagnostics.failedCaptureAttemptsInRange for failed gateway attempts in range.",
      methods: result.methods.map((m) => ({
        ...m,
        /** @deprecated all included rows are settled or logged completed */
        successfulCount: m.totalCount,
        /** @deprecated compat stub — not real failure stats; see basis.compatFields */
        failedCount: 0,
        successfulAmount: m.totalAmount,
        /** @deprecated compat stub */
        failedAmount: 0,
        /** @deprecated compat stub — not real success rate; see basis.compatFields */
        successRate: m.totalCount > 0 ? 100 : 0,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load payment methods report");
  }
}
