import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { notifyProviderEnRoute } from "@/lib/notifications/notification-service";

/**
 * PATCH /api/provider/bookings/[id]/eta
 * Update provider ETA while en route (at-home only).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
    const etaMinutesRaw = body.eta_minutes ?? body.etaMinutes;
    const etaMinutes = Number(etaMinutesRaw);

    if (!Number.isFinite(etaMinutes) || etaMinutes < 1 || etaMinutes > 240) {
      return errorResponse("eta_minutes must be between 1 and 240", "VALIDATION_ERROR", 400);
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, provider_id, location_id, location_type, current_stage, estimated_arrival, provider_eta_minutes")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!booking) {
      return notFoundResponse("Booking not found");
    }

    const bookingData = booking as {
      location_id?: string | null;
      location_type?: string;
      current_stage?: string | null;
      estimated_arrival?: string | null;
      provider_eta_minutes?: number | null;
    };

    const supabaseAdmin = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdmin,
      user.id,
      user.role,
      providerId,
      bookingData.location_id ?? null,
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    if (bookingData.location_type !== "at_home") {
      return errorResponse("ETA updates are only for at-home bookings", "INVALID_REQUEST", 400);
    }
    if (bookingData.current_stage !== "provider_on_way") {
      return errorResponse("ETA can only be updated while en route", "INVALID_STATUS", 400);
    }

    const previousMinutes = Number(bookingData.provider_eta_minutes ?? 0);
    const delta = Math.abs(etaMinutes - previousMinutes);

    const etaDate = new Date();
    etaDate.setMinutes(etaDate.getMinutes() + etaMinutes);

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        provider_eta_minutes: Math.round(etaMinutes),
        eta_source: "manual",
        estimated_arrival: etaDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    if (delta > 10) {
      try {
        await notifyProviderEnRoute(id, etaDate.toISOString(), ["push"]);
      } catch (notifErr) {
        console.warn("[PATCH eta] customer notify failed:", notifErr);
      }
    }

    const { data: updated } = await supabaseAdmin
      .from("bookings")
      .select("id, estimated_arrival, provider_eta_minutes, eta_source, current_stage")
      .eq("id", id)
      .single();

    return successResponse({ booking: updated });
  } catch (error) {
    return handleApiError(error, "Failed to update ETA");
  }
}
