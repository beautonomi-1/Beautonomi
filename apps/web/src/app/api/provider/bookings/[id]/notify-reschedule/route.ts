import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  handleApiError,
  errorResponse,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { sendRescheduleNotification } from "@/lib/notifications/appointment-notifications";

/**
 * POST /api/provider/bookings/[id]/notify-reschedule
 * Send reschedule notification to customer (server-side only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const providerId = await getProviderIdForUser(user.id);
    if (!providerId) return notFoundResponse("Provider not found");

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const { old_date, old_time, new_date, new_time } = body;

    if (!old_date || !old_time || !new_date || !new_time) {
      return errorResponse("old_date, old_time, new_date, new_time required", "VALIDATION_ERROR", 400);
    }

    // Calendar passes `group:<uuid>` for group bookings — resolve to the
    // primary contact booking (which carries the customer record we notify).
    let bookingIdForNotification = id;
    if (id.startsWith("group:")) {
      const groupId = id.slice("group:".length);
      const { data: group } = await supabase
        .from("group_bookings")
        .select("provider_id, primary_contact_booking_id")
        .eq("id", groupId)
        .single();
      const groupRow = group as { provider_id?: string; primary_contact_booking_id?: string | null } | null;
      if (!groupRow || groupRow.provider_id !== providerId) {
        return notFoundResponse("Group booking not found");
      }
      if (!groupRow.primary_contact_booking_id) {
        return errorResponse(
          "This group session has no primary contact yet — notify participants individually.",
          "GROUP_PRIMARY_CONTACT_MISSING",
          400,
        );
      }
      bookingIdForNotification = groupRow.primary_contact_booking_id;
    } else {
      const { data: booking } = await supabase
        .from("bookings")
        .select("provider_id")
        .eq("id", id)
        .single();
      const row = booking as { provider_id?: string } | null;
      if (!row || row.provider_id !== providerId) {
        return notFoundResponse("Booking not found");
      }
    }

    const result = await sendRescheduleNotification(
      bookingIdForNotification,
      { date: old_date, time: old_time },
      { date: new_date, time: new_time },
      { shouldSend: true, channels: ["push", "email", "sms"] }
    );

    return successResponse({ success: result.success, sent: result.sent, error: result.error });
  } catch (error) {
    return handleApiError(error, "Failed to send reschedule notification");
  }
}
