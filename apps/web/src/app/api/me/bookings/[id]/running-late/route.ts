import { NextRequest } from "next/server";
import {
  errorResponse,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  canCustomerReportRunningLate,
  isAllowedRunningLateMinutes,
} from "@/lib/bookings/lifecycle-running-late";
import { notifyProviderCustomerRunningLate } from "@/lib/notifications/notification-service";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_BOOKING_RUNNING_LATE_REPORTED } from "@/lib/analytics/amplitude/types";

/**
 * POST /api/me/bookings/[id]/running-late
 * @tenant-hint Service-role read/update is scoped with .eq("customer_id", user.id) (customer self); not a cross-tenant listing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const { id } = await params;
    const body = (await request.json()) as { delay_minutes?: number };
    const delayMinutes = Number(body.delay_minutes);

    if (!isAllowedRunningLateMinutes(delayMinutes)) {
      return errorResponse("Invalid delay_minutes", "VALIDATION_ERROR", 400);
    }

    const admin = getSupabaseAdmin();
    const { data: booking, error } = await admin
      .from("bookings")
      .select(
        "id, customer_id, status, scheduled_at, location_type, current_stage, customer_running_late_at, booking_services(scheduled_end_at, duration_minutes)",
      )
      .eq("id", id)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!booking) return notFoundResponse("Booking not found");

    const guard = canCustomerReportRunningLate(booking as any);
    if (guard.ok === false) {
      return errorResponse(`Cannot report running late: ${guard.reason}`, guard.reason, 400);
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await admin
      .from("bookings")
      .update({
        customer_running_late_at: nowIso,
        customer_running_late_minutes: delayMinutes,
        provider_late_ack_at: null,
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("customer_id", user.id);

    if (updateError) throw updateError;

    await notifyProviderCustomerRunningLate(id, delayMinutes);

    try {
      await trackServer(
        EVENT_BOOKING_RUNNING_LATE_REPORTED,
        { booking_id: id, delay_minutes: delayMinutes },
        user.id,
        { insertId: `booking_running_late_reported:${id}:${nowIso}` },
      );
    } catch {
      // non-blocking
    }

    return successResponse({
      booking_id: id,
      delay_minutes: delayMinutes,
      reported_at: nowIso,
    });
  } catch (error) {
    return handleApiError(error, "Failed to report running late");
  }
}
