import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { generateOTP, getOTPExpiry } from "@/lib/otp/generator";
import { sendOTPToCustomer } from "@/lib/otp/notifications";
import { generateVerificationCode, getQRCodeExpiry, type QRCodeData } from "@/lib/qr/generator";
import { getVerificationSettings } from "@/lib/platform-settings";
import { NextResponse } from "next/server";

const RESEND_COOLDOWN_SECONDS = 90;

/**
 * POST /api/me/bookings/[id]/resend-arrival-otp
 *
 * Customer requests a new arrival PIN. Rate limited to once per 90 seconds per booking.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        provider:providers(id, business_name),
        customer:users!bookings_customer_id_fkey(id, full_name, email, phone)
      `)
      .eq("id", id)
      .eq("customer_id", user.id)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    type ResendOtpBookingRow = {
      location_type?: string; current_stage?: string; arrival_otp_verified?: boolean;
      customer?: { id?: string; full_name?: string; email?: string; phone?: string } | { id?: string; full_name?: string; email?: string; phone?: string }[];
      booking_number?: string;
      provider?: { business_name?: string } | { business_name?: string }[];
    };
    const bookingData = booking as ResendOtpBookingRow;

    if (bookingData.location_type !== "at_home") {
      return errorResponse(
        "This endpoint is only for at-home bookings",
        "INVALID_REQUEST",
        400
      );
    }

    if (bookingData.current_stage !== "provider_arrived") {
      return errorResponse(
        "Provider has not arrived yet",
        "INVALID_STATUS",
        400
      );
    }

    if (bookingData.arrival_otp_verified) {
      return errorResponse(
        "Arrival already verified",
        "ALREADY_VERIFIED",
        400
      );
    }

    const { data: lastRefreshEvent } = await supabase
      .from("booking_events")
      .select("created_at")
      .eq("booking_id", id)
      .in("event_type", ["otp_sent", "qr_code_generated"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastRefreshEvent?.created_at) {
      const lastSent = new Date(lastRefreshEvent.created_at).getTime();
      const now = Date.now();
      if (now - lastSent < RESEND_COOLDOWN_SECONDS * 1000) {
        const retryAfter = Math.ceil(
          (RESEND_COOLDOWN_SECONDS * 1000 - (now - lastSent)) / 1000
        );
        return NextResponse.json(
          {
            data: null,
            error: {
              message: `Please wait ${retryAfter} seconds before resending.`,
              code: "RATE_LIMITED",
            },
          },
          { status: 429, headers: { "Retry-After": String(retryAfter) } }
        );
      }
    }

    const verificationSettings = await getVerificationSettings();
    const { otp_enabled, qr_code_enabled } = verificationSettings;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    let otp: string | null = null;
    let otpExpiresAt: Date | null = null;
    if (otp_enabled) {
      otp = generateOTP();
      otpExpiresAt = getOTPExpiry();
      updatePayload.arrival_otp = otp;
      updatePayload.arrival_otp_expires_at = otpExpiresAt.toISOString();
      updatePayload.arrival_otp_verified = false;
    }

    let qrExpiresAtIso: string | undefined;
    if (qr_code_enabled) {
      const qrVerificationCode = generateVerificationCode();
      const qrExpiresAt = getQRCodeExpiry();
      qrExpiresAtIso = qrExpiresAt.toISOString();
      const qrCodeData: QRCodeData = {
        booking_id: id,
        booking_number: String(bookingData.booking_number ?? ""),
        verification_code: qrVerificationCode,
        expires_at: qrExpiresAtIso,
        type: "arrival_verification",
      };
      updatePayload.qr_code_data = qrCodeData;
      updatePayload.qr_code_verification_code = qrVerificationCode;
      updatePayload.qr_code_expires_at = qrExpiresAtIso;
      updatePayload.qr_code_verified = false;
    }

    const { error: updateError } = await supabase.from("bookings").update(updatePayload).eq("id", id);
    if (updateError) {
      throw updateError;
    }

    if (otp_enabled && otp && otpExpiresAt) {
      await supabase.from("booking_events").insert({
        booking_id: id,
        event_type: "otp_sent",
        event_data: {
          expires_at: otpExpiresAt.toISOString(),
        },
        created_by: user.id,
      });
    }

    if (qr_code_enabled && qrExpiresAtIso) {
      await supabase.from("booking_events").insert({
        booking_id: id,
        event_type: "qr_code_generated",
        event_data: {
          expires_at: qrExpiresAtIso,
          source: "customer_resend",
        },
        created_by: user.id,
      });
    }

    const customer = Array.isArray(bookingData.customer) ? bookingData.customer[0] : bookingData.customer;
    const provider = Array.isArray(bookingData.provider) ? bookingData.provider[0] : bookingData.provider;
    if (customer && otp_enabled && otp) {
      try {
        await sendOTPToCustomer({
          customerId: customer.id ?? "",
          phone: customer.phone || "",
          email: customer.email || "",
          otp,
          bookingId: id,
          bookingNumber: bookingData.booking_number ?? "",
          providerName: provider?.business_name || "Provider",
          customerName: customer.full_name || "Customer",
        });
      } catch (otpError) {
        console.error("Failed to send OTP on resend:", otpError);
      }
    }

    return successResponse({
      arrival_otp_expires_at: otpExpiresAt?.toISOString(),
      qr_code_expires_at: qrExpiresAtIso,
      message:
        otp_enabled && qr_code_enabled
          ? "New verification code and QR are ready in the app."
          : qr_code_enabled && !otp_enabled
            ? "A new QR code is ready in the app."
            : "New code sent. Check your app or notifications.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to resend code");
  }
}
