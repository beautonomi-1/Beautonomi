import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { notifyProviderEnRoute } from "@/lib/notifications/notification-service";
import type { Booking } from "@/types/beautonomi";

/** PostgREST reports an unknown column as PGRST204 ("… in the schema cache"). */
function isUnknownColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: string }).code ?? "");
  const message = String((error as { message?: string }).message ?? "").toLowerCase();
  return code === "PGRST204" || message.includes("schema cache");
}

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

    // Idempotent: a retry (double tap, flaky network) must not emit a second
    // `provider_on_way` event or re-notify the customer.
    if (bookingData.current_stage === "provider_on_way") {
      return successResponse({
        booking: bookingData as Booking,
        message: "Provider journey already started",
      });
    }
    if (
      bookingData.current_stage &&
      bookingData.current_stage !== "confirmed"
    ) {
      return errorResponse(
        "This booking has already moved past the journey step.",
        "HOUSECALL_STAGE_REQUIRED",
        409,
      );
    }

    // Persist the stage change *before* emitting the event, under an optimistic
    // concurrency guard. A failure here must surface to the provider: an orphaned
    // `provider_on_way` event with an unchanged `current_stage` leaves the app
    // rendering "Start journey" forever with no indication anything went wrong.
    const currentVersion = (bookingData as { version?: number }).version || 0;
    const nowIso = new Date().toISOString();
    const corePayload: Record<string, unknown> = {
      current_stage: "provider_on_way",
      provider_en_route_at: nowIso,
      updated_at: nowIso,
      version: currentVersion + 1,
    };
    if (estimatedArrivalIso) {
      corePayload.estimated_arrival = estimatedArrivalIso;
    }
    const etaPayload: Record<string, unknown> =
      providerEtaMinutes != null
        ? { provider_eta_minutes: providerEtaMinutes, eta_source: "manual" }
        : {};

    const applyUpdate = (payload: Record<string, unknown>) =>
      supabase
        .from("bookings")
        .update(payload)
        .eq("id", id)
        .eq("version", currentVersion)
        .select("*");

    let { data: updatedRows, error: updateError } = await applyUpdate({
      ...corePayload,
      ...etaPayload,
    });

    // Schema drift guard: `provider_eta_minutes` / `eta_source` arrive in migration
    // 862. If an environment is behind, still advance the journey rather than
    // stranding the provider — but make the drift loud in the logs.
    if (updateError && Object.keys(etaPayload).length > 0 && isUnknownColumnError(updateError)) {
      console.error(
        "[start-journey] ETA columns missing — apply supabase/migrations/862_booking_journey_dashboard.sql",
        { bookingId: id, error: updateError.message },
      );
      ({ data: updatedRows, error: updateError } = await applyUpdate(corePayload));
    }

    if (updateError) {
      throw updateError;
    }
    if (!updatedRows?.length) {
      return errorResponse(
        "Booking was modified by another user. Please refresh and try again.",
        "CONFLICT",
        409,
      );
    }

    const updatedBooking = updatedRows[0];

    // Create booking event (audit trail). The stage change is already durable, so
    // a failure here is logged rather than rolled back onto the provider.
    const { error: eventError } = await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "provider_on_way",
        event_data: {
          estimated_arrival: estimatedArrivalIso,
          eta_minutes: providerEtaMinutes,
          started_at: nowIso,
        },
        created_by: user.id,
      });

    if (eventError) {
      console.error("[start-journey] Failed to record booking event", {
        bookingId: id,
        error: eventError.message,
      });
    }

    // Notify customer via template pipeline (push + in-app bell row).
    await notifyProviderEnRoute(id, estimatedArrivalIso, ["push", "email"]);

    return successResponse({
      booking: updatedBooking as Booking,
      message: "Provider journey started successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to start provider journey");
  }
}
