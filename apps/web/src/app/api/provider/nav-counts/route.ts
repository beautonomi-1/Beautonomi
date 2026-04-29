import { NextRequest } from "next/server";
import { getProviderIdForUser, handleApiError, notFoundResponse, requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ACTIVE_PRODUCT_ORDER_STATUSES = ["pending", "confirmed", "processing", "ready_for_collection", "shipped"];

/**
 * Lightweight alert counters for provider navigation surfaces.
 *
 * Keep this endpoint narrow and count-only so web and native nav badges can
 * refresh frequently without loading full booking/order/message lists.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const [
      pendingBookings,
      activeProductOrders,
      unreadConversations,
      waitingRoom,
    ] = await Promise.all([
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("status", "pending"),
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
    ]);

    for (const result of [pendingBookings, activeProductOrders, unreadConversations, waitingRoom]) {
      if (result.error) throw result.error;
    }

    const counts = {
      pending_bookings: pendingBookings.count ?? 0,
      active_product_orders: activeProductOrders.count ?? 0,
      unread_messages: (unreadConversations.data ?? []).reduce(
        (sum: number, row: { unread_count_provider?: number | null }) => sum + Number(row.unread_count_provider ?? 0),
        0,
      ),
      waiting_room: waitingRoom.count ?? 0,
    };

    return successResponse({
      ...counts,
      critical_total:
        counts.pending_bookings +
        counts.active_product_orders +
        counts.unread_messages +
        counts.waiting_room,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load provider navigation counters");
  }
}
