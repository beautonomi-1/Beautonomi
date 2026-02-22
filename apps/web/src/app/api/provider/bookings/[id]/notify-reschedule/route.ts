import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, notFoundResponse, handleApiError, errorResponse, successResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
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
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const providerId = await getProviderIdForUser(permissionCheck.user.id);
    if (!providerId) return notFoundResponse("Provider not found");

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const { old_date, old_time, new_date, new_time } = body;

    if (!old_date || !old_time || !new_date || !new_time) {
      return errorResponse("old_date, old_time, new_date, new_time required", "VALIDATION_ERROR", 400);
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("provider_id")
      .eq("id", id)
      .single();
    if (!booking || (booking as any).provider_id !== providerId) {
      return notFoundResponse("Booking not found");
    }

    const result = await sendRescheduleNotification(
      id,
      { date: old_date, time: old_time },
      { date: new_date, time: new_time },
      { shouldSend: true }
    );

    return successResponse({ success: result.success, sent: result.sent, error: result.error });
  } catch (error) {
    return handleApiError(error, "Failed to send reschedule notification");
  }
}
