import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { isValidOTPFormat, isOTPExpired } from "@/lib/otp/generator";
import type { Booking } from "@/types/beautonomi";
import { z } from "zod";

const verifyArrivalSchema = z.object({
  otp: z.string().regex(/^\d{4}$|^\d{6}$/, "OTP must be 4 or 6 digits"),
});

/**
 * POST /api/provider/bookings/[id]/verify-arrival
 *
 * Provider submits the verification code from the customer (customer-holds-PIN flow).
 * Only for at-home bookings. Sets arrival_otp_verified so provider can start service.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    const validationResult = verifyArrivalSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Invalid OTP format",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { otp } = validationResult.data;

    if (!isValidOTPFormat(otp)) {
      return errorResponse("OTP must be 4 or 6 digits", "INVALID_OTP_FORMAT", 400);
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

    const bookingData = booking as any;

    if (bookingData.location_type !== "at_home") {
      return errorResponse(
        "This endpoint is only for at-home bookings",
        "INVALID_REQUEST",
        400
      );
    }

    if (bookingData.current_stage !== "provider_arrived") {
      return errorResponse(
        "Provider must have marked as arrived first",
        "INVALID_STATUS",
        400
      );
    }

    if (!bookingData.arrival_otp) {
      return errorResponse(
        "No verification code has been generated for this booking",
        "NO_OTP",
        400
      );
    }

    if (
      bookingData.arrival_otp_expires_at &&
      isOTPExpired(bookingData.arrival_otp_expires_at)
    ) {
      return errorResponse(
        "Verification code has expired. Ask the customer to request a new one.",
        "OTP_EXPIRED",
        400
      );
    }

    if (bookingData.arrival_otp_verified) {
      return errorResponse(
        "Arrival has already been verified",
        "ALREADY_VERIFIED",
        400
      );
    }

    if (bookingData.arrival_otp !== otp) {
      return errorResponse(
        "Invalid code. Please check with the customer and try again.",
        "INVALID_OTP",
        400
      );
    }

    const { error: eventError } = await supabase.from("booking_events").insert({
      booking_id: id,
      event_type: "otp_verified",
      event_data: {
        verified_at: new Date().toISOString(),
        verified_by: "provider",
      },
      created_by: user.id,
    });

    if (eventError) {
      console.error("Error creating booking event:", eventError);
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        arrival_otp_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return handleApiError(updateError, "Failed to update booking");
    }

    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      message: "Verified. You can start the service.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to verify arrival");
  }
}
