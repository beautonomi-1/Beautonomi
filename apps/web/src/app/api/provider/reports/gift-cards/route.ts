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
import { subDays, subMonths } from "date-fns";
import { fetchAllPaged, fetchInIdChunks } from "@/lib/provider-ops/postgrest-unbounded";

/**
 * GET /api/provider/reports/gift-cards
 *
 * Native combined report: redemption captures at this provider for bookings that used a gift card,
 * with the same dual window as web sales/redemptions: booking.scheduled_at and redemption.captured_at
 * both inside the computed period (except period=all uses full booking set but still filters captures by date range).
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

    let bookingsWithGiftCards: Array<{ id: string }> = [];
    try {
      bookingsWithGiftCards = await fetchAllPaged<{ id: string }>(async (from, to) => {
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
        const { data, error } = await bookingsQuery
          .order("scheduled_at", { ascending: true })
          .range(from, to);
        return { data, error };
      }, 20_000);
    } catch (bookingsError) {
      const msg =
        bookingsError && typeof bookingsError === "object" && "message" in bookingsError
          ? String((bookingsError as { message?: unknown }).message ?? "")
          : "";
      if (msg.includes("relation") || msg.includes("does not exist")) {
        return successResponse(emptyCombined());
      }
      throw bookingsError;
    }

    const bookingIds = bookingsWithGiftCards.map((b) => b.id);
    if (bookingIds.length === 0) {
      return successResponse(emptyCombined());
    }

    let redemptionsList: Array<{
      id?: string;
      gift_card_id?: string;
      amount?: number | null;
      captured_at?: string | null;
    }> = [];
    try {
      redemptionsList = await fetchInIdChunks(
        bookingIds,
        (slice) =>
          supabaseAdmin
            .from("gift_card_redemptions")
            .select("id, gift_card_id, booking_id, amount, captured_at")
            .eq("status", "captured")
            .not("captured_at", "is", null)
            .gte("captured_at", fromDate.toISOString())
            .lte("captured_at", toDate.toISOString())
            .in("booking_id", slice),
        { throwOnError: true },
      );
    } catch (redErr) {
      const msg =
        redErr && typeof redErr === "object" && "message" in redErr
          ? String((redErr as { message?: unknown }).message ?? "")
          : "";
      if (msg.includes("gift_card_redemptions") || msg.includes("relation")) {
        return successResponse(emptyCombined());
      }
      throw redErr;
    }
    const total_redeemed = redemptionsList.length;
    const total_revenue = redemptionsList.reduce((s, r) => s + Number(r.amount || 0), 0);
    const avg_value = total_redeemed > 0 ? total_revenue / total_redeemed : 0;

    const giftCardIds = [
      ...new Set(
        redemptionsList
          .map((r) => r.gift_card_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    const giftCards =
      giftCardIds.length > 0
        ? await fetchInIdChunks<{
            id: string;
            code?: string;
            initial_balance?: unknown;
            balance?: unknown;
            expires_at?: string | null;
            created_at?: string;
          }>(giftCardIds, (slice) =>
            supabaseAdmin
              .from("gift_cards")
              .select("id, code, initial_balance, balance, expires_at, created_at")
              .in("id", slice),
          )
        : [];
    const giftCardMap = new Map(giftCards.map((g) => [g.id, g]));

    const cards = redemptionsList.slice(0, 100).map((r) => {
      const gc = giftCardMap.get(r.gift_card_id ?? "") as
        | { code?: string; initial_balance?: unknown; expires_at?: string | null; created_at?: string }
        | undefined;
      const amt = Number(r.amount ?? gc?.initial_balance ?? 0);
      return {
        id: r.id,
        code: (gc?.code ?? String(r.gift_card_id ?? "").slice(0, 8)) || "—",
        initial_value: amt,
        remaining_value: 0,
        status: "redeemed",
        purchaser_name: null as string | null,
        recipient_name: null as string | null,
        purchased_at: gc?.created_at ?? r.captured_at ?? new Date().toISOString(),
        redeemed_at: r.captured_at,
        captured_at: r.captured_at,
        expires_at: gc?.expires_at ?? null,
      };
    });

    const reportBasis =
      period === "all"
        ? `Period: all bookings with a gift card (no scheduled_at filter); redemptions still filtered by captured_at from epoch through now. Matches web logic: booking must use a gift card; redemption row captured and dated in range.`
        : `Bookings with gift_card_id and scheduled_at in the selected period; gift_card_redemptions status captured with captured_at in the same period. List preview up to 100 rows.`;

    return successResponse({
      period,
      reportBasis,
      basis: {
        headline:
          "Stats reflect captured redemption rows linked to your bookings with gift_card_id set — not platform-wide card sales.",
        naming:
          "stats.total_sold mirrors redemption row count for backward compatibility; value is sum of redemption amounts.",
      },
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
    return handleApiError(error, "Failed to load gift card report");
  }
}

function emptyCombined() {
  return {
    period: null as string | null,
    reportBasis: "No qualifying data for the selected filters.",
    basis: {
      headline: "Captured redemptions for bookings using gift cards at this provider.",
      naming: "See reportBasis when data exists.",
    },
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
  };
}
