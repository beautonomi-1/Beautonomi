import { NextRequest } from "next/server";
import { z } from "zod";
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
import { getVerificationSettings } from "@/lib/platform-settings";
import { sendArrivalOverrideNotification } from "@/lib/otp/notifications";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import type { Booking } from "@/types/beautonomi";

const overrideSchema = z.object({
  reason_code: z.enum([
    "customer_no_phone",
    "customer_technical_issue",
    "customer_refused",
    "other",
  ]),
  reason_text: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

/** Great-circle distance in metres (same formula as the location ping route). */
function haversineDistanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * POST /api/provider/bookings/[id]/override-arrival-verification
 *
 * Provider escape hatch when the customer cannot show OTP/QR.
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

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const { id } = await params;

    const body = await request.json();
    const parsed = overrideSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid override request", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const verificationSettings = await getVerificationSettings();
    if (!verificationSettings.allow_provider_override) {
      return errorResponse(
        "Manual arrival override is disabled by platform settings",
        "FORBIDDEN",
        403,
      );
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdmin,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null,
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    const bookingData = booking as Record<string, unknown>;

    if (bookingData.location_type !== "at_home") {
      return errorResponse("Override is only for at-home bookings", "INVALID_REQUEST", 400);
    }

    if (bookingData.arrival_otp_verified || bookingData.qr_code_verified) {
      return errorResponse("Arrival is already verified", "ALREADY_VERIFIED", 400);
    }

    const { reason_code, reason_text, latitude, longitude } = parsed.data;
    const hasCoords = latitude != null && longitude != null;
    const overriddenAt = new Date().toISOString();

    // Distance from the booking's address at the moment of override (evidence).
    const destLat =
      bookingData.address_latitude != null ? Number(bookingData.address_latitude) : null;
    const destLng =
      bookingData.address_longitude != null ? Number(bookingData.address_longitude) : null;
    const distanceM =
      hasCoords && destLat != null && destLng != null
        ? haversineDistanceM(latitude!, longitude!, destLat, destLng)
        : null;

    await supabase.from("booking_events").insert({
      booking_id: id,
      event_type: "arrival_verification_overridden",
      event_data: {
        reason_code,
        reason_text: reason_text ?? null,
        location: hasCoords ? { lat: latitude, lng: longitude } : null,
        distance_to_target_m: distanceM,
        overridden_at: overriddenAt,
        overridden_by: user.id,
      },
      created_by: user.id,
    });

    // Persist the verification flags, and — when the provider shared GPS —
    // stamp their exact override location onto the booking so disputes and the
    // admin tracking panel show where the provider was when they overrode.
    const bookingUpdate: Record<string, unknown> = {
      arrival_otp_verified: true,
      qr_code_verified: true,
      provider_arrived_at:
        (bookingData.provider_arrived_at as string | null) ?? overriddenAt,
      current_stage:
        bookingData.current_stage === "service_started" ||
        bookingData.current_stage === "service_completed"
          ? bookingData.current_stage
          : "provider_arrived",
      updated_at: overriddenAt,
    };
    if (hasCoords) {
      bookingUpdate.provider_location = { latitude, longitude };
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update(bookingUpdate)
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    // Mirror into the Gods-Eye tracking state so the admin tracking panel and
    // disputes view reflect the override location/arrival.
    if (hasCoords) {
      const trackingUpsert: Record<string, unknown> = {
        booking_id: id,
        tracking_enabled: true,
        provider_last_lat: latitude,
        provider_last_lng: longitude,
        provider_last_at: overriddenAt,
        arrived_at_target: true,
        arrived_at: overriddenAt,
        status: "arrived",
        updated_at: overriddenAt,
      };
      if (destLat != null && destLng != null) {
        trackingUpsert.customer_target_lat = destLat;
        trackingUpsert.customer_target_lng = destLng;
        trackingUpsert.last_distance_to_target_m = distanceM;
        trackingUpsert.arrived_distance_m = distanceM;
      }
      const { error: trackErr } = await supabaseAdmin
        .from("booking_tracking_state")
        .upsert(trackingUpsert, { onConflict: "booking_id" });
      if (trackErr) {
        console.error("Override: failed to upsert booking_tracking_state:", trackErr);
      }

      // Record a manual ping so the override location appears in the admin
      // ping trail / GPS-ping count alongside automatic foreground pings.
      const { error: pingErr } = await supabaseAdmin
        .from("provider_location_events")
        .insert({
          provider_id: providerId,
          user_id: user.id,
          booking_id: id,
          source: "manual",
          lat: latitude,
          lng: longitude,
          recorded_at: overriddenAt,
        });
      if (pingErr) {
        console.error("Override: failed to insert manual provider_location_event:", pingErr);
      }
    }

    // Notify the customer that arrival was reported without their code, and
    // record a high-risk audit trail for dispute review.
    const customerId = bookingData.customer_id as string | null;
    const bookingNumber = (bookingData.booking_number as string | null) ?? "";
    if (customerId) {
      const { data: providerRow } = await supabaseAdmin
        .from("providers")
        .select("business_name")
        .eq("id", providerId)
        .maybeSingle();
      const providerName =
        (providerRow as { business_name?: string } | null)?.business_name || "Your provider";
      void sendArrivalOverrideNotification(customerId, bookingNumber, providerName, id);
    }

    const reqMeta = extractRequestMeta(request);
    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "provider.booking.arrival_overridden",
      entity_type: "booking",
      entity_id: id,
      module: "providers_operations",
      risk_level: "high",
      retention_tier: "operational",
      status: "succeeded",
      reason: reason_text ?? reason_code,
      metadata: {
        provider_id: providerId,
        reason_code,
        has_location: hasCoords,
        location: hasCoords ? { lat: latitude, lng: longitude } : null,
        distance_to_target_m: distanceM,
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    }).catch((auditErr) => {
      console.error("Failed to write arrival_overridden audit log:", auditErr);
    });

    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      message: "Arrival verified manually. You can start the service.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to override arrival verification");
  }
}
