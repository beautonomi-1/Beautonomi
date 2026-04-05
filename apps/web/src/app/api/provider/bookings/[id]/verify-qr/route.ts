import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { parseQRCodeData, validateQRCodeData } from "@/lib/qr/generator";
import type { Booking } from "@/types/beautonomi";

function normalizeQrDataInput(qr_data: unknown): string | null {
  if (qr_data == null) return null;
  if (typeof qr_data === "string") {
    const t = qr_data.trim();
    return t.length ? t : null;
  }
  if (typeof qr_data === "object") {
    try {
      return JSON.stringify(qr_data);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * POST /api/provider/bookings/[id]/verify-qr
 * 
 * Verify QR code for booking arrival
 * Can be used by provider to verify customer's QR code scan
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const { verification_code, qr_data } = body;

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

    const bookingData = booking as any;

    const supabaseAdmin = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdmin,
      user.id,
      user.role,
      providerId,
      (bookingData as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    // Only allow for at-home bookings
    if (bookingData.location_type !== "at_home") {
      return errorResponse("This endpoint is only for at-home bookings", "INVALID_REQUEST", 400);
    }

    if (bookingData.current_stage !== "provider_arrived") {
      return errorResponse("Provider must have marked as arrived first", "INVALID_STATUS", 400);
    }

    if (bookingData.arrival_otp_verified) {
      return errorResponse("Arrival has already been verified", "ALREADY_VERIFIED", 400);
    }

    const qrPayloadString = normalizeQrDataInput(qr_data);

    // Parse QR code data if provided
    let qrCodeData = null;
    if (qrPayloadString) {
      qrCodeData = parseQRCodeData(qrPayloadString);
      if (!qrCodeData) {
        return errorResponse("Invalid QR code data", "INVALID_QR_CODE", 400);
      }
    }

    // Verify using verification code or QR code data
    let isValid = false;
    if (verification_code && String(verification_code).trim()) {
      const normalized = String(verification_code).replace(/\s/g, "").toUpperCase();
      // Direct verification code check
      if (bookingData.qr_code_verification_code === normalized) {
        // Check expiry
        if (bookingData.qr_code_expires_at && new Date(bookingData.qr_code_expires_at) > new Date()) {
          isValid = true;
        } else {
          return errorResponse("QR code has expired", "QR_CODE_EXPIRED", 400);
        }
      } else {
        return errorResponse("Invalid verification code", "INVALID_CODE", 400);
      }
    } else if (qrCodeData) {
      const stored = String(bookingData.qr_code_verification_code ?? "").toUpperCase();
      const fromPayload = String(qrCodeData.verification_code ?? "").toUpperCase();
      isValid =
        validateQRCodeData(qrCodeData, id) &&
        qrCodeData.type === "arrival_verification" &&
        stored.length > 0 &&
        fromPayload === stored;
    } else {
      return errorResponse("Verification code or QR code data required", "MISSING_DATA", 400);
    }

    if (!isValid) {
      return errorResponse("Invalid or expired QR code", "INVALID_QR_CODE", 400);
    }

    // Update booking to mark QR code as verified
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        qr_code_verified: true,
        arrival_otp_verified: true, // Also mark OTP as verified if QR code is verified
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    // Create verification event
    await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "qr_code_verified",
        event_data: {
          verified_at: new Date().toISOString(),
          verification_method: verification_code ? "code" : "qr_scan",
        },
        created_by: user.id,
      });

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      message: "QR code verified successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to verify QR code");
  }
}
