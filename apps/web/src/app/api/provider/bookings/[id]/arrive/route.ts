import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { generateOTP, getOTPExpiry } from "@/lib/otp/generator";
import { sendOTPToCustomer } from "@/lib/otp/notifications";
import { generateVerificationCode, getQRCodeExpiry, type QRCodeData } from "@/lib/qr/generator";
import { getVerificationSettings } from "@/lib/platform-settings";
import type { Booking } from "@/types/beautonomi";

/**
 * POST /api/provider/bookings/[id]/arrive
 * 
 * Mark provider as arrived and generate OTP for customer verification
 * Only for at-home bookings
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
    const { latitude, longitude } = body; // Optional: provider's current location

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get provider business name
    const { data: provider } = await supabase
      .from("providers")
      .select("business_name")
      .eq("id", providerId)
      .single();

    const providerData = provider as any;

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        customers:users!bookings_customer_id_fkey(id, full_name, email, phone)
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const bookingData = booking as any;

    // Only allow for at-home bookings
    if (bookingData.location_type !== "at_home") {
      return errorResponse("This endpoint is only for at-home bookings", "INVALID_REQUEST", 400);
    }

    // Check if booking is in correct state
    if (bookingData.status !== "confirmed" && bookingData.current_stage !== "provider_on_way") {
      return errorResponse("Provider must start journey before arriving", "INVALID_STATUS", 400);
    }

    // Get platform verification settings
    const verificationSettings = await getVerificationSettings();
    const { otp_enabled, qr_code_enabled, require_verification } = verificationSettings;

    // If verification is not required, just mark as arrived without OTP/QR code
    if (!require_verification) {
      // Create booking event
      const { error: eventError } = await supabase
        .from("booking_events")
        .insert({
          booking_id: id,
          event_type: "provider_arrived",
          event_data: {
            location: latitude && longitude ? { lat: latitude, lng: longitude } : null,
            arrived_at: new Date().toISOString(),
            verification_method: "simple_confirmation",
          },
          created_by: user.id,
        });

      if (eventError) {
        throw eventError;
      }

      // Update booking - simple confirmation, no verification needed
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          current_stage: "provider_arrived",
          arrival_otp_verified: true, // Auto-verified with simple confirmation
          qr_code_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateError) {
        throw updateError;
      }

      // Fetch updated booking
      const { data: updatedBooking } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", id)
        .single();

      return successResponse({
        booking: updatedBooking as Booking,
        otp: null,
        qr_code: null,
        verification_code: null,
        message: "Arrival confirmed (simple confirmation mode)",
      });
    }

    // Verification is required - generate OTP and/or QR code based on settings
    // Validate that at least one verification method is enabled
    if (!otp_enabled && !qr_code_enabled) {
      // If both are disabled but verification is required, this is an invalid state
      // Fall back to simple confirmation
      console.warn("Verification required but both OTP and QR code are disabled. Using simple confirmation.");
      // Continue with simple confirmation logic below
    }

    let otp: string | null = null;
    let otpExpiresAt: Date | null = null;
    if (otp_enabled) {
      otp = generateOTP();
      otpExpiresAt = getOTPExpiry();
    }

    // Generate QR code if enabled
    let qrVerificationCode: string | null = null;
    let qrExpiresAt: Date | null = null;
    let qrCodeData: QRCodeData | null = null;
    if (qr_code_enabled) {
      qrVerificationCode = generateVerificationCode();
      qrExpiresAt = getQRCodeExpiry();
      qrCodeData = {
        booking_id: id,
        booking_number: bookingData.booking_number,
        verification_code: qrVerificationCode,
        expires_at: qrExpiresAt.toISOString(),
        type: "arrival_verification",
      };
    }

    // If both verification methods are disabled, treat as simple confirmation
    if (!otp_enabled && !qr_code_enabled) {
      // Update booking - simple confirmation, no verification needed
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          current_stage: "provider_arrived",
          arrival_otp_verified: true, // Auto-verified with simple confirmation
          qr_code_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateError) {
        throw updateError;
      }

      // Fetch updated booking
      const { data: updatedBooking } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", id)
        .single();

      return successResponse({
        booking: updatedBooking as Booking,
        otp: null,
        qr_code: null,
        verification_code: null,
        message: "Arrival confirmed (simple confirmation mode - verification methods disabled)",
      });
    }

    // Create booking event
    const { error: eventError } = await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "provider_arrived",
        event_data: {
          otp: otp,
          qr_code: qrCodeData,
          location: latitude && longitude ? { lat: latitude, lng: longitude } : null,
          arrived_at: new Date().toISOString(),
        },
        created_by: user.id,
      });

    if (eventError) {
      throw eventError;
    }

    // Create OTP sent event if OTP is enabled
    if (otp_enabled && otp && otpExpiresAt) {
      await supabase
        .from("booking_events")
        .insert({
          booking_id: id,
          event_type: "otp_sent",
          event_data: {
            otp: otp,
            expires_at: otpExpiresAt.toISOString(),
          },
          created_by: user.id,
        });
    }

    // Create QR code generated event if QR code is enabled
    if (qr_code_enabled && qrCodeData && qrExpiresAt) {
      await supabase
        .from("booking_events")
        .insert({
          booking_id: id,
          event_type: "qr_code_generated",
          event_data: {
            qr_code: qrCodeData,
            expires_at: qrExpiresAt.toISOString(),
          },
          created_by: user.id,
        });
    }

    // Update booking with OTP and/or QR code based on settings
    const updateData: any = {
      current_stage: "provider_arrived",
      updated_at: new Date().toISOString(),
    };

    if (otp_enabled && otp && otpExpiresAt) {
      updateData.arrival_otp = otp;
      updateData.arrival_otp_expires_at = otpExpiresAt.toISOString();
      updateData.arrival_otp_verified = false;
    } else {
      // If OTP is disabled, clear OTP fields
      updateData.arrival_otp = null;
      updateData.arrival_otp_expires_at = null;
      updateData.arrival_otp_verified = false;
    }

    if (qr_code_enabled && qrCodeData && qrVerificationCode && qrExpiresAt) {
      updateData.qr_code_data = qrCodeData;
      updateData.qr_code_verification_code = qrVerificationCode;
      updateData.qr_code_expires_at = qrExpiresAt.toISOString();
      updateData.qr_code_verified = false;
    } else {
      // If QR code is disabled, clear QR code fields
      updateData.qr_code_data = null;
      updateData.qr_code_verification_code = null;
      updateData.qr_code_expires_at = null;
      updateData.qr_code_verified = false;
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    // Send OTP to customer if enabled
    const customer = bookingData.customers;
    if (customer && otp_enabled && otp) {
      try {
        await sendOTPToCustomer({
          customerId: customer.id,
          phone: customer.phone || "",
          email: customer.email || "",
          otp: otp,
          bookingNumber: bookingData.booking_number,
          providerName: providerData?.business_name || "Provider",
          customerName: customer.full_name || "Customer",
        });
      } catch (otpError) {
        // If OTP sending fails, log but don't fail the request
        // QR code is still available as fallback
        console.error("Failed to send OTP, QR code available as fallback:", otpError);
      }
    }

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      otp: otp, // Return OTP for provider to manually share if needed (null if disabled)
      qr_code: qrCodeData, // Return QR code data (null if disabled)
      verification_code: qrVerificationCode, // QR code verification code (null if disabled)
      message: !require_verification
        ? "Arrival confirmed (simple confirmation mode)"
        : otp_enabled && qr_code_enabled && otp && qrCodeData
        ? "OTP and QR code generated. OTP sent to customer."
        : otp_enabled && otp
        ? "OTP generated and sent to customer."
        : qr_code_enabled && qrCodeData
        ? "QR code generated for verification."
        : "Arrival marked. No verification required.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to mark provider as arrived");
  }
}
