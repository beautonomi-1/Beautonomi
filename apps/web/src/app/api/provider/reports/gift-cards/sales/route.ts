import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";

/**
 * GET /api/provider/reports/gift-cards/sales
 *
 * Despite the path name, rows are **captured gift-card redemptions** at this provider (Beautonomi sells cards).
 * Includes only redemptions where the linked booking’s **scheduled_at** and the redemption’s **captured_at**
 * both fall in the selected window (plus filters below).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
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

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, gift_card_id, gift_card_amount, scheduled_at")
      .eq("provider_id", providerId)
      .not("gift_card_id", "is", null)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    const { data: bookingsWithGiftCards, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      if (
        bookingsError.message.includes("bookings") ||
        bookingsError.message.includes("relation") ||
        bookingsError.message.includes("does not exist")
      ) {
        return successResponse(emptyPayload(reportContext.timezone, fromYmd, toYmd));
      }
      throw bookingsError;
    }

    const bookingIds = bookingsWithGiftCards?.map((b) => b.id) || [];
    if (bookingIds.length === 0) {
      return successResponse(emptyPayload(reportContext.timezone, fromYmd, toYmd));
    }

    let redemptionsQuery = supabaseAdmin
      .from("gift_card_redemptions")
      .select("id, gift_card_id, booking_id, amount, currency, status, captured_at")
      .eq("status", "captured")
      .not("captured_at", "is", null)
      .gte("captured_at", fromDate.toISOString())
      .lte("captured_at", toDate.toISOString())
      .in("booking_id", bookingIds);

    const { data: redemptions, error: redemptionsError } = await redemptionsQuery;

    if (redemptionsError) {
      if (
        redemptionsError.message.includes("gift_card_redemptions") ||
        redemptionsError.message.includes("relation") ||
        redemptionsError.message.includes("does not exist")
      ) {
        return successResponse(emptyPayload(reportContext.timezone, fromYmd, toYmd));
      }
      throw redemptionsError;
    }

    const redeemRows = redemptions || [];
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

    const reportBasis =
      `Period ${fromYmd}–${toYmd} (${reportContext.timezone}). ` +
      `Counts captured rows in gift_card_redemptions (status=captured, captured_at set) ` +
      `whose booking_id is a booking for this provider with gift_card_id set, ` +
      `with bookings.scheduled_at and captured_at both inside the window. ` +
      `Gift cards are sold by the platform; this is redemption value at your business, not card purchase revenue to you as retailer.`;

    return successResponse({
      timezone: reportContext.timezone,
      fromYmd,
      toYmd,
      reportBasis,
      basis: {
        bookingFilter:
          "Bookings for this provider with gift_card_id not null and scheduled_at in range (location_id when filtered).",
        redemptionFilter:
          "gift_card_redemptions status captured; captured_at in range; booking_id in that booking set.",
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
      bookingFilter:
        "Bookings for this provider with gift_card_id not null and scheduled_at in range (location_id when filtered).",
      redemptionFilter:
        "gift_card_redemptions status captured; captured_at in range; booking_id in that booking set.",
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
