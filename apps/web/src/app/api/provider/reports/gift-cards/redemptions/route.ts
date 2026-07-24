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

/**
 * GET /api/provider/reports/gift-cards/redemptions
 *
 * Recent captured redemptions with the same booking + capture window rules as …/gift-cards/sales.
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
        return successResponse(emptyRedemptions(reportContext.timezone, fromYmd, toYmd));
      }
      throw bookingsError;
    }

    const bookingIds = bookingsWithGiftCards?.map((b) => b.id) || [];
    if (bookingIds.length === 0) {
      return successResponse(emptyRedemptions(reportContext.timezone, fromYmd, toYmd));
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
        return successResponse(emptyRedemptions(reportContext.timezone, fromYmd, toYmd));
      }
      throw redemptionsError;
    }

    const rows = redemptions || [];
    const totalRedemptions = rows.length;
    const totalRedeemedValue = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const averageRedemptionValue = totalRedemptions > 0 ? totalRedeemedValue / totalRedemptions : 0;

    const reportBasis =
      `Period ${fromYmd}–${toYmd} (${reportContext.timezone}). ` +
      `Lists up to 20 captured gift-card redemptions with the same booking + captured_at window rules as the sales summary report.`;

    return successResponse({
      timezone: reportContext.timezone,
      fromYmd,
      toYmd,
      reportBasis,
      basis: {
        bookingWindow: "Same as sales report — bookings with gift_card_id, scheduled_at in range.",
        redemptionWindow: "captured_at in range; status captured; booking_id in that booking set.",
        listLimit: "Preview list capped at 20 rows (sorted by API default order).",
        redemptionRate:
          "Not computed per provider — platform-wide issuance vs your redemptions would need separate data.",
      },
      totalRedemptions,
      totalRedeemedValue,
      averageRedemptionValue,
      redemptionRate: 0,
      redemptionRateNote: "Not applicable — platform sells cards; no per-provider issuance denominator here.",
      redemptions: rows.slice(0, 20).map((r) => ({
        id: r.id,
        gift_card_id: r.gift_card_id,
        booking_id: r.booking_id,
        amount: Number(r.amount || 0),
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
  const reportBasis = `Period ${fromYmd}–${toYmd} (${timezone}). No qualifying redemptions in range.`;
  return {
    timezone,
    fromYmd,
    toYmd,
    reportBasis,
    basis: {
      bookingWindow: "Bookings with gift_card_id, scheduled_at in range.",
      redemptionWindow: "captured_at in range; status captured.",
      listLimit: "Up to 20 rows when data exists.",
      redemptionRate: "Not computed per provider.",
    },
    totalRedemptions: 0,
    totalRedeemedValue: 0,
    averageRedemptionValue: 0,
    redemptionRate: 0,
    redemptionRateNote:
      "Platform sells cards — redemption rate vs issuance is not computed in this report.",
    redemptions: [] as Array<Record<string, unknown>>,
    note: "Platform sells gift cards.",
    report_basis: reportBasis,
  };
}
