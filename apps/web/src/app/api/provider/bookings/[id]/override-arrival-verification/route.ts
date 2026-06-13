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
import type { Booking } from "@/types/beautonomi";

const overrideSchema = z.object({
  reason_code: z.enum([
    "customer_no_phone",
    "customer_technical_issue",
    "customer_refused",
    "other",
  ]),
  reason_text: z.string().max(500).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

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

    await supabase.from("booking_events").insert({
      booking_id: id,
      event_type: "arrival_verification_overridden",
      event_data: {
        reason_code,
        reason_text: reason_text ?? null,
        location:
          latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null,
        overridden_at: new Date().toISOString(),
        overridden_by: user.id,
      },
      created_by: user.id,
    });

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        arrival_otp_verified: true,
        qr_code_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

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
