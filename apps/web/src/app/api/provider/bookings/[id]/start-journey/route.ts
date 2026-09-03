import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { notifyProviderEnRoute } from "@/lib/notifications/notification-service";
import type { Booking } from "@/types/beautonomi";

/**
 * POST /api/provider/bookings/[id]/start-journey
 * 
 * Mark provider as "on the way" for at-home bookings
 * Creates booking event and notifies customer
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const { estimated_arrival, eta_minutes: etaMinutesRaw } = body;

    let estimatedArrivalIso: string | null =
      typeof estimated_arrival === "string" && estimated_arrival.trim()
        ? estimated_arrival.trim()
        : null;
    let providerEtaMinutes: number | null = null;
    if (etaMinutesRaw != null && etaMinutesRaw !== "") {
      const etaMinutes = Math.round(Number(etaMinutesRaw));
      if (!Number.isFinite(etaMinutes) || etaMinutes < 1 || etaMinutes > 240) {
        return errorResponse("eta_minutes must be between 1 and 240", "VALIDATION_ERROR", 400);
      }
      providerEtaMinutes = etaMinutes;
      const etaDate = new Date();
      etaDate.setMinutes(etaDate.getMinutes() + etaMinutes);
      estimatedArrivalIso = etaDate.toISOString();
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const supabaseAdmin = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdmin,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    const bookingData = booking as any;

    // Only allow for at-home bookings
    if (bookingData.location_type !== "at_home") {
      return errorResponse("This endpoint is only for at-home bookings", "INVALID_REQUEST", 400);
    }

    // Confirmed or provider-confirmed ("booked") — matches provider app Confirm action
    if (bookingData.status !== "confirmed" && bookingData.status !== "booked") {
      return errorResponse("Booking must be confirmed before starting journey", "INVALID_STATUS", 400);
    }

    // Create booking event
    const { error: eventError } = await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "provider_on_way",
        event_data: {
          estimated_arrival: estimatedArrivalIso,
          eta_minutes: providerEtaMinutes,
          started_at: new Date().toISOString(),
        },
        created_by: user.id,
      });

    if (eventError) {
      throw eventError;
    }

    // Update booking current_stage (if field exists, otherwise use status)
    const updatePayload: Record<string, unknown> = {
      current_stage: "provider_on_way",
      provider_en_route_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (estimatedArrivalIso) {
      updatePayload.estimated_arrival = estimatedArrivalIso;
    }
    if (providerEtaMinutes != null) {
      updatePayload.provider_eta_minutes = providerEtaMinutes;
      updatePayload.eta_source = "manual";
    }
    const { error: updateError } = await supabase
      .from("bookings")
      .update(updatePayload)
      .eq("id", id);

    if (updateError) {
      console.error("Error updating booking stage:", updateError);
      // Don't fail - event is created
    }

    // Notify customer via template pipeline (push + in-app bell row).
    await notifyProviderEnRoute(id, estimatedArrivalIso, ["push", "email"]);

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      message: "Provider journey started successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to start provider journey");
  }
}
