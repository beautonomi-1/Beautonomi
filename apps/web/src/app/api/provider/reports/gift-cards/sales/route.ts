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
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import {
  fetchProviderGiftCardRedemptions,
  giftCardRedemptionReportBasis,
} from "@/lib/reports/gift-card-provider-redemptions";

/**
 * GET /api/provider/reports/gift-cards/sales
 *
 * Despite the path name, rows are **captured gift-card redemptions** at this provider (Beautonomi sells cards).
 * Includes only redemptions where the linked booking’s **scheduled_at** and the redemption’s **captured_at**
 * both fall in the selected window (plus filters below).
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

    const { rows: redeemRows, truncated } = await fetchProviderGiftCardRedemptions(supabaseAdmin, {
      providerId,
      fromDate,
      toDate,
      locationId,
    });
    if (redeemRows.length === 0) {
      return successResponse(emptyPayload(reportContext.timezone, fromYmd, toYmd));
    }
    const totalGiftCardsSold = redeemRows.length;
    const totalRevenue = redeemRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const averageGiftCardValue = totalGiftCardsSold > 0 ? totalRevenue / totalGiftCardsSold : 0;

    const amountMap = new Map<number, number>();
    redeemRows.forEach((redemption) => {
      const amount = Number(redemption.amount || 0);
      amountMap.set(amount, (amountMap.get(amount) || 0) + 1);
    });

    const giftCardSales = Array.from(amountMap.entries())
      .map(([amount, count]) => ({
        amount,
        count,
        revenue: amount * count,
        percentage: totalGiftCardsSold > 0 ? (count / totalGiftCardsSold) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

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
        bookingFilter:
          "Booking must belong to this provider, use a gift card, and match location when filtered.",
        redemptionFilter: "gift_card_redemptions status captured; captured_at in range.",
        headlineCount: "Number of redemption rows (each row is one capture event).",
        headlineValue: "Sum of redemption.amount for those rows.",
        breakdown: "Rows grouped by redemption amount; percentage is share of redemption rows in this window.",
      },
      totalGiftCardsSold,
      totalGiftCardsRedeemed: totalGiftCardsSold,
      totalRevenue,
      averageGiftCardValue,
      giftCardSales,
      note: "Platform sells gift cards. Metrics are redemptions at your business.",
      report_basis: reportBasis,
    });
  } catch (error) {
    console.error("gift-cards/sales:", error);
    return handleApiError(error, "Failed to load gift card redemption summary");
  }
}

function emptyPayload(timezone: string, fromYmd: string, toYmd: string) {
  const reportBasis =
    `Period ${fromYmd}–${toYmd} (${timezone}). No qualifying bookings or redemptions in range — same filters as populated responses.`;
  return {
    timezone,
    fromYmd,
    toYmd,
    reportBasis,
    basis: {
      bookingFilter: "Provider booking with gift_card_id; location when filtered.",
      redemptionFilter: "Captured_at in range.",
      headlineCount: "Number of redemption rows.",
      headlineValue: "Sum of redemption.amount.",
      breakdown: "Grouped by redemption amount.",
    },
    totalGiftCardsSold: 0,
    totalGiftCardsRedeemed: 0,
    totalRevenue: 0,
    averageGiftCardValue: 0,
    giftCardSales: [] as Array<{ amount: number; count: number; revenue: number; percentage: number }>,
    note: "Platform sells gift cards. Metrics are redemptions at your business.",
    report_basis: reportBasis,
  };
}
