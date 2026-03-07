import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, subMonths } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const sp = request.nextUrl.searchParams;
    const period = sp.get("period") || "month";
    const locationId = sp.get("location_id") || null;

    const toDate = new Date();
    let fromDate: Date;
    if (period === "all") fromDate = new Date(0);
    else if (period === "year") fromDate = subMonths(toDate, 12);
    else if (period === "quarter") fromDate = subMonths(toDate, 3);
    else if (period === "week") fromDate = subDays(toDate, 7);
    else if (period === "today") fromDate = subDays(toDate, 0);
    else fromDate = subMonths(toDate, 1);

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, gift_card_id, gift_card_amount, scheduled_at")
      .eq("provider_id", providerId)
      .not("gift_card_id", "is", null);
    if (period !== "all") {
      bookingsQuery = bookingsQuery
        .gte("scheduled_at", fromDate.toISOString())
        .lte("scheduled_at", toDate.toISOString());
    }
    if (locationId) bookingsQuery = bookingsQuery.eq("location_id", locationId);

    const { data: bookingsWithGiftCards, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      if (
        bookingsError.message.includes("relation") ||
        bookingsError.message.includes("does not exist")
      ) {
        return successResponse({
          stats: {
            total_sold: 0,
            total_revenue: 0,
            total_redeemed: 0,
            total_outstanding: 0,
            active_count: 0,
            expired_count: 0,
            avg_value: 0,
          },
          cards: [],
        });
      }
      throw bookingsError;
    }

    const bookingIds = (bookingsWithGiftCards || []).map((b: any) => b.id);
    if (bookingIds.length === 0) {
      return successResponse({
        stats: {
          total_sold: 0,
          total_revenue: 0,
          total_redeemed: 0,
          total_outstanding: 0,
          active_count: 0,
          expired_count: 0,
          avg_value: 0,
        },
        cards: [],
      });
    }

    const { data: redemptions, error: redErr } = await supabaseAdmin
      .from("gift_card_redemptions")
      .select("id, gift_card_id, booking_id, amount, captured_at")
      .eq("status", "captured")
      .not("captured_at", "is", null)
      .in("booking_id", bookingIds);

    if (redErr) {
      if (
        redErr.message.includes("gift_card_redemptions") ||
        redErr.message.includes("relation")
      ) {
        return successResponse({
          stats: {
            total_sold: 0,
            total_revenue: 0,
            total_redeemed: 0,
            total_outstanding: 0,
            active_count: 0,
            expired_count: 0,
            avg_value: 0,
          },
          cards: [],
        });
      }
      throw redErr;
    }

    const redemptionsList = redemptions || [];
    const total_redeemed = redemptionsList.length;
    const total_revenue = redemptionsList.reduce((s, r) => s + Number(r.amount || 0), 0);
    const avg_value = total_redeemed > 0 ? total_revenue / total_redeemed : 0;

    const giftCardIds = [...new Set(redemptionsList.map((r: any) => r.gift_card_id))];
    const { data: giftCards } =
      giftCardIds.length > 0
        ? await supabaseAdmin
            .from("gift_cards")
            .select("id, code, initial_balance, balance, expires_at, created_at")
            .in("id", giftCardIds)
        : { data: [] };
    const giftCardMap = new Map(
      (giftCards || []).map((g: any) => [g.id, g])
    );

    const cards = redemptionsList.slice(0, 100).map((r: any) => {
      const gc = giftCardMap.get(r.gift_card_id);
      return {
        id: r.id,
        code: gc?.code ?? r.gift_card_id?.slice(0, 8) ?? "—",
        initial_value: Number(r.amount ?? gc?.initial_balance ?? 0),
        remaining_value: 0,
        status: "redeemed",
        purchaser_name: null as string | null,
        recipient_name: null as string | null,
        purchased_at: gc?.created_at ?? r.captured_at ?? new Date().toISOString(),
        redeemed_at: r.captured_at,
        expires_at: gc?.expires_at ?? null,
      };
    });

    return successResponse({
      stats: {
        total_sold: total_redeemed,
        total_revenue,
        total_redeemed,
        total_outstanding: 0,
        active_count: 0,
        expired_count: 0,
        avg_value,
      },
      cards,
    });
  } catch (error) {
    return handleApiError(error, "GIFT_CARD_REPORT_ERROR", 500);
  }
}
