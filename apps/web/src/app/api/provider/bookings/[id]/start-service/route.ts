import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import type { Booking } from "@/types/beautonomi";

/**
 * POST /api/provider/bookings/[id]/start-service
 *
 * Mark service as started (after OTP verification for at-home bookings).
 *
 * Auth matches GET booking detail and PATCH: any provider_owner / provider_staff
 * on the account can start service (granular `edit_appointments` alone was
 * blocking mobile staff without that flag).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Proxy group:UUID ids to the group-bookings endpoint (status → started).
    if (id.startsWith("group:")) {
      const groupId = id.slice("group:".length);
      const groupUrl = new URL(`/api/provider/group-bookings/${groupId}`, request.url);
      groupUrl.searchParams.set("action", "start_service");
      return NextResponse.redirect(groupUrl, 307);
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const supabaseAdminBranch = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdminBranch,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    const bookingData = booking as any;

    // For at-home bookings, check if verification was required and completed
    if (bookingData.location_type === "at_home") {
      // If OTP or QR code exists but not verified, require verification
      // If neither exists (simple confirmation mode), allow service start
      const hasVerificationMethod = bookingData.arrival_otp || bookingData.qr_code_data;
      if (hasVerificationMethod && !bookingData.arrival_otp_verified && !bookingData.qr_code_verified) {
        return errorResponse("Customer must verify provider arrival before starting service", "VERIFICATION_NOT_COMPLETE", 400);
      }
    }

    // Ready status (confirmed or provider-confirmed "booked") or at-home arrived stage
    if (
      bookingData.status !== "confirmed" &&
      bookingData.status !== "booked" &&
      bookingData.status !== "waiting" &&
      bookingData.status !== "checked_in" &&
      bookingData.current_stage !== "provider_arrived"
    ) {
      return errorResponse("Booking must be confirmed and provider must have arrived", "INVALID_STATUS", 400);
    }

    // Create booking event
    const { error: eventError } = await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "service_started",
        event_data: {
          started_at: new Date().toISOString(),
        },
        created_by: user.id,
      });

    if (eventError) {
      console.error("Error creating booking event:", eventError);
    }

    // Update booking with version bump
    const currentVersion = (bookingData as { version?: number }).version || 0;
    const { data: updatedRows, error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "in_progress",
        current_stage: "service_started",
        updated_at: new Date().toISOString(),
        version: currentVersion + 1,
      })
      .eq("id", id)
      .eq("version", currentVersion)
      .select("id");

    if (updateError) {
      throw updateError;
    }
    if (!updatedRows?.length) {
      return errorResponse(
        "Booking was modified by another user. Please refresh and try again.",
        "CONFLICT",
        409
      );
    }

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    // §Release-audit 2026-04: let the customer know the service has begun.
    // Fire-and-forget — notification failure must not break the provider's
    // start-service action.
    try {
      const { sendServiceStartedNotification } = await import(
        "@/lib/bookings/notifications"
      );
      const durationMinutes =
        typeof (updatedBooking as { duration_minutes?: number | null } | null)?.duration_minutes === "number"
          ? ((updatedBooking as { duration_minutes?: number | null })!.duration_minutes as number)
          : null;
      await sendServiceStartedNotification(id, durationMinutes);
    } catch (notifyErr) {
      console.error("[start-service] notification failed:", notifyErr);
    }

    return successResponse({
      booking: updatedBooking as Booking,
      message: "Service started successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to start service");
  }
}
