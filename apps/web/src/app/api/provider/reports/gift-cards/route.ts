import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import {
  fetchProviderGiftCardRedemptions,
  giftCardCapturePeriodBounds,
  giftCardRedemptionReportBasis,
} from "@/lib/reports/gift-card-provider-redemptions";

/**
 * GET /api/provider/reports/gift-cards
 *
 * Native combined report: gift card captures at this provider by capture date.
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

    const sp = request.nextUrl.searchParams;
    const period = sp.get("period") || "month";
    const locationId = sp.get("location_id") || null;

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate, fromYmd, toYmd } = giftCardCapturePeriodBounds(period, reportContext.timezone);

    const { rows, truncated } = await fetchProviderGiftCardRedemptions(supabaseAdmin, {
      providerId,
      fromDate,
      toDate,
      locationId,
    });

    if (rows.length === 0) {
      const reportBasis = giftCardRedemptionReportBasis(
        fromYmd,
        toYmd,
        reportContext.timezone,
        false,
      );
      return successResponse({
        period,
        reportBasis,
        basis: { headline: "Captured gift-card amounts at your business by capture date." },
        stats: { total_sold: 0, total_revenue: 0, total_redeemed: 0, avg_value: 0 },
        cards: [],
      });
    }

    const total_redeemed = rows.length;
    const total_revenue = rows.reduce((s, r) => s + r.amount, 0);
    const avg_value = total_redeemed > 0 ? total_revenue / total_redeemed : 0;

    const reportBasis = giftCardRedemptionReportBasis(
      fromYmd,
      toYmd,
      reportContext.timezone,
      truncated,
    );

    const cards = rows.slice(0, 100).map((r) => ({
      id: r.id,
      code: r.gift_card_code ?? "—",
      amount: r.amount,
      captured_at: r.captured_at,
      booking_id: r.booking_id,
      booking_number: r.booking_number,
      scheduled_at: r.scheduled_at,
    }));

    return successResponse({
      period,
      reportBasis,
      basis: {
        headline:
          "Captured gift-card amounts at your business by capture date — not cards your salon sold.",
      },
      stats: {
        total_sold: total_redeemed,
        total_revenue,
        total_redeemed,
        avg_value,
      },
      cards,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load gift card report");
  }
}
