import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  notFoundResponse,
  handleApiError,
  errorResponse,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { sendCancellationNotification } from "@/lib/notifications/appointment-notifications";

/**
 * POST /api/provider/bookings/[id]/notify-cancellation
 * Send cancellation notification to customer (server-side only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requireAnyPermission(["cancel_appointments", "edit_appointments"], request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { id } = await params;
    const body = await request.json();
    const cancellationType = body.cancellation_type as "normal" | "late_cancel" | "no_show";

    if (!["normal", "late_cancel", "no_show"].includes(cancellationType)) {
      return errorResponse("cancellation_type must be normal, late_cancel, or no_show", "VALIDATION_ERROR", 400);
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
      if (!booking || (booking as { provider_id?: string }).provider_id !== providerId) {
        return notFoundResponse("Booking not found");
      }
    }

    const result = await sendCancellationNotification(
      bookingIdForNotification,
      cancellationType,
      { shouldSend: true, channels: ["push", "email", "sms"] }
    );

    return successResponse({ success: result.success, sent: result.sent, error: result.error });
  } catch (error) {
    return handleApiError(error, "Failed to send cancellation notification");
  }
}
