import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import {
  fetchProviderGiftCardRedemptions,
  giftCardRedemptionReportBasis,
} from "@/lib/reports/gift-card-provider-redemptions";

/**
 * GET /api/provider/reports/gift-cards/redemptions
 *
 * Captured gift-card redemptions at this provider by capture date.
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request, { reportType: "gift_cards" });
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate, fromYmd, toYmd } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;

    const { rows, truncated } = await fetchProviderGiftCardRedemptions(supabaseAdmin, {
      providerId,
      fromDate,
      toDate,
      locationId,
    });

    if (rows.length === 0) {
      return successResponse(emptyRedemptions(reportContext.timezone, fromYmd, toYmd));
    }

    const totalRedemptions = rows.length;
    const totalRedeemedValue = rows.reduce((sum, r) => sum + r.amount, 0);
    const averageRedemptionValue = totalRedemptions > 0 ? totalRedeemedValue / totalRedemptions : 0;

    const reportBasis = giftCardRedemptionReportBasis(
      fromYmd,
      toYmd,
      reportContext.timezone,
      truncated,
    );

    return successResponse({
      timezone: reportContext.timezone,
      fromYmd,
      toYmd,
      reportBasis,
      basis: {
        redemptionWindow: "captured_at in range; status captured; booking at this provider with gift_card_id.",
        listLimit: "Preview list capped at 20 rows (newest captures first).",
      },
      totalRedemptions,
      totalRedeemedValue,
      averageRedemptionValue,
      redemptions: rows.slice(0, 20).map((r) => ({
        id: r.id,
        gift_card_id: r.gift_card_id,
        gift_card_code: r.gift_card_code,
        booking_id: r.booking_id,
        booking_number: r.booking_number,
        scheduled_at: r.scheduled_at,
        amount: r.amount,
        currency: r.currency,
        captured_at: r.captured_at,
        redeemed_at: r.captured_at,
      })),
      note: "Platform sells gift cards. Rows are redemptions at your business.",
      report_basis: reportBasis,
    });
  } catch (error) {
    console.error("gift-cards/redemptions:", error);
    return handleApiError(error, "Failed to load gift card redemptions");
  }
}

function emptyRedemptions(timezone: string, fromYmd: string, toYmd: string) {
  const reportBasis = giftCardRedemptionReportBasis(fromYmd, toYmd, timezone, false);
  return {
    timezone,
    fromYmd,
    toYmd,
    reportBasis,
    basis: {
      redemptionWindow: "captured_at in range; status captured.",
      listLimit: "Up to 20 rows when data exists.",
    },
    totalRedemptions: 0,
    totalRedeemedValue: 0,
    averageRedemptionValue: 0,
    redemptions: [] as Array<Record<string, unknown>>,
    note: "Platform sells gift cards.",
    report_basis: reportBasis,
  };
}
