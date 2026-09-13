import { NextRequest } from "next/server";
import { addMinutes } from "date-fns";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { notifyCustomerRunningLateAck } from "@/lib/notifications/notification-service";

/**
 * POST /api/provider/bookings/[id]/acknowledge-late
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: booking, error } = await supabase
      .from("bookings")
      .select(
        "id, provider_id, customer_id, scheduled_at, customer_running_late_minutes, customer_running_late_at, providers(timezone, business_name)",
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw error;
    if (!booking) return notFoundResponse("Booking not found");
    if (!booking.customer_running_late_at || !booking.customer_running_late_minutes) {
      return errorResponse("Customer has not reported running late", "NO_LATE_REPORT", 400);
    }

    const nowIso = new Date().toISOString();
    const adjusted = addMinutes(
      new Date(booking.scheduled_at),
      Number(booking.customer_running_late_minutes),
    );

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        provider_late_ack_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", id);

    if (updateError) throw updateError;

    await notifyCustomerRunningLateAck(id, adjusted);

    try {
      const { trackServer } = await import("@/lib/analytics/amplitude/server");
      const { EVENT_BOOKING_RUNNING_LATE_ACKED } = await import("@/lib/analytics/amplitude/types");
      await trackServer(
        EVENT_BOOKING_RUNNING_LATE_ACKED,
        { booking_id: id },
        booking.customer_id ?? undefined,
        { insertId: `booking_running_late_acked:${id}:${nowIso}` },
      );
    } catch {
      // non-blocking
    }

    return successResponse({
      booking_id: id,
      acknowledged_at: nowIso,
      adjusted_time: adjusted.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, "Failed to acknowledge running late");
  }
}
