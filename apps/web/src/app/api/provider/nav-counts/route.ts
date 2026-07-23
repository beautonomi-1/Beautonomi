import { NextRequest } from "next/server";
import { getProviderIdForUser, handleApiError, notFoundResponse, requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  dashboardBookingLocationOrFilter,
  dashboardGroupBookingLocationOrFilter,
} from "@/lib/server/provider/dashboard-booking-location-filter";

const ACTIVE_PRODUCT_ORDER_STATUSES = ["pending", "confirmed", "processing", "ready_for_collection", "shipped"];

/**
 * Lightweight alert counters for provider navigation surfaces.
 *
 * Keep this endpoint narrow and count-only so web and native nav badges can
 * refresh frequently without loading full booking/order/message lists.
 *
 * `pending_bookings`: statuses `pending` (confirm) and `pending_payment` (matches bookings list chips).
 * `stale_pending_bookings`: subset of the above whose `scheduled_at` is before the start of
 * today (UTC) — these have fallen outside the ±30-day date-strip window in the provider app's
 * Day view and would otherwise be unreachable/un-actionable without the Overview "all dates"
 * deep link. Not added to `critical_total` (it's already included via `pending_bookings`).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const locationId = request.nextUrl.searchParams.get("location_id")?.trim() || null;
    const bookingLocationOrFilter = locationId ? dashboardBookingLocationOrFilter(locationId) : null;
    const groupLocationOrFilter = locationId
      ? dashboardGroupBookingLocationOrFilter(locationId)
      : null;

    const startOfTodayUtc = new Date();
    startOfTodayUtc.setUTCHours(0, 0, 0, 0);
    const staleCutoffIso = startOfTodayUtc.toISOString();

    const [
      pendingBookings,
      pendingGroupBookings,
      staleBookings,
      staleGroupBookings,
      activeProductOrders,
      unreadConversations,
      waitingRoom,
      openReturnRequests,
      pendingCustomRequests,
    ] = await Promise.all([
      (() => {
        let q = supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("provider_id", providerId)
          .in("status", ["pending", "pending_payment"]);
        if (bookingLocationOrFilter) q = q.or(bookingLocationOrFilter);
        return q;
      })(),
      // Group bookings in pending state count towards the provider's pending badge
      (() => {
        let q = supabase
          .from("group_bookings")
          .select("id", { count: "exact", head: true })
          .eq("provider_id", providerId)
          .in("status", ["pending"]);
        if (groupLocationOrFilter) q = q.or(groupLocationOrFilter);
        return q;
      })(),
      (() => {
        let q = supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("provider_id", providerId)
          .in("status", ["pending", "pending_payment"])
          .lt("scheduled_at", staleCutoffIso);
        if (bookingLocationOrFilter) q = q.or(bookingLocationOrFilter);
        return q;
      })(),
      (() => {
        let q = supabase
          .from("group_bookings")
          .select("id", { count: "exact", head: true })
          .eq("provider_id", providerId)
          .eq("status", "pending")
          .lt("scheduled_at", staleCutoffIso);
        if (groupLocationOrFilter) q = q.or(groupLocationOrFilter);
        return q;
      })(),
      (supabase.from("product_orders") as any)
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .in("status", ACTIVE_PRODUCT_ORDER_STATUSES),
      supabase
        .from("conversations")
        .select("unread_count_provider")
        .eq("provider_id", providerId)
        .gt("unread_count_provider", 0)
        .or("is_archived_provider.is.null,is_archived_provider.eq.false"),
      // Mirror the waiting-room GET filter: checked_in | waiting | confirmed + must have checked_in_time set
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .in("status", ["checked_in", "waiting", "confirmed"])
        .not("checked_in_time", "is", null),
      supabase
        .from("product_return_requests")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .in("status", ["pending", "approved", "item_received", "escalated"]),
      supabase
        .from("custom_requests")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("status", "pending"),
    ]);

    for (const result of [pendingBookings, pendingGroupBookings, staleBookings, staleGroupBookings, activeProductOrders, unreadConversations, waitingRoom, pendingCustomRequests]) {
      if (result.error) throw result.error;
    }

    let openReturnsCount = 0;
    if (openReturnRequests.error) {
      if (openReturnRequests.error.code !== "42P01" && openReturnRequests.error.code !== "42703") {
        throw openReturnRequests.error;
      }
    } else {
      openReturnsCount = openReturnRequests.count ?? 0;
    }

    const counts = {
      pending_bookings: (pendingBookings.count ?? 0) + (pendingGroupBookings.count ?? 0),
      stale_pending_bookings: (staleBookings.count ?? 0) + (staleGroupBookings.count ?? 0),
      active_product_orders: activeProductOrders.count ?? 0,
      unread_messages: (unreadConversations.data ?? []).reduce(
        (sum: number, row: { unread_count_provider?: number | null }) => sum + Number(row.unread_count_provider ?? 0),
        0,
      ),
      waiting_room: waitingRoom.count ?? 0,
      open_return_requests: openReturnsCount,
      pending_custom_requests: pendingCustomRequests.count ?? 0,
    };

    return successResponse({
      ...counts,
      critical_total:
        counts.pending_bookings +
        counts.active_product_orders +
        counts.unread_messages +
        counts.waiting_room +
        counts.open_return_requests +
        counts.pending_custom_requests,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load provider navigation counters");
  }
}
