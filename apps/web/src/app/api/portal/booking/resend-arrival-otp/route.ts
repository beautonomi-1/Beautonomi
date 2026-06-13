import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { validatePortalToken } from "@/lib/portal/token";
import { checkPortalRateLimit } from "@/lib/rate-limit/portal";
import { applyRateLimitHeaders } from "@/lib/rate-limit/headers";
import { generateOTP, getOTPExpiry } from "@/lib/otp/generator";
import { generateVerificationCode, getQRCodeExpiry, type QRCodeData } from "@/lib/qr/generator";
import { getVerificationSettings } from "@/lib/platform-settings";

const RESEND_COOLDOWN_SECONDS = 90;

/**
 * POST /api/portal/booking/resend-arrival-otp?token=
 *
 * Guest portal: refresh arrival PIN / QR while provider is waiting.
 */
export async function POST(request: NextRequest) {
  const rate = await checkPortalRateLimit(request);
  if (!rate.allowed) {
    const response = handleApiError(
      new Error("Rate limit exceeded"),
      "Too many requests. Please try again later.",
      "RATE_LIMITED",
      429
    );
    return applyRateLimitHeaders(response, {
      limit: 10,
      remaining: rate.remaining,
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return errorResponse("Access token is required", "TOKEN_REQUIRED", 400);
    }

    const supabase = await getSupabaseServer();
    const supabaseAdmin = getSupabaseAdmin();

    const validation = await validatePortalToken(supabase, token);
    if (!validation.isValid || !validation.bookingId) {
      return errorResponse(
        validation.reason || "Invalid or expired access token",
        "INVALID_TOKEN",
        401
      );
    }

    const bookingId = validation.bookingId;

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, location_type, current_stage, arrival_otp_verified, booking_number")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return errorResponse("Booking not found", "NOT_FOUND", 404);
    }

    if (booking.location_type !== "at_home") {
      return errorResponse("This endpoint is only for at-home bookings", "INVALID_REQUEST", 400);
    }

    if (booking.current_stage !== "provider_arrived") {
      return errorResponse("Provider has not arrived yet", "INVALID_STATUS", 400);
    }

    if (booking.arrival_otp_verified) {
      return errorResponse("Arrival already verified", "ALREADY_VERIFIED", 400);
    }

    const { data: lastRefreshEvent } = await supabaseAdmin
      .from("booking_events")
      .select("created_at")
      .eq("booking_id", bookingId)
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
              message: `Please wait ${retryAfter} seconds before refreshing.`,
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

    let otpExpiresAt: Date | null = null;
    if (otp_enabled) {
      const otp = generateOTP();
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
        booking_id: bookingId,
        booking_number: String(booking.booking_number ?? ""),
        verification_code: qrVerificationCode,
        expires_at: qrExpiresAtIso,
        type: "arrival_verification",
      };
      updatePayload.qr_code_data = qrCodeData;
      updatePayload.qr_code_verification_code = qrVerificationCode;
      updatePayload.qr_code_expires_at = qrExpiresAtIso;
      updatePayload.qr_code_verified = false;
    }

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update(updatePayload)
      .eq("id", bookingId);

    if (updateError) {
      throw updateError;
    }

    if (otp_enabled && otpExpiresAt) {
      await supabaseAdmin.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "otp_sent",
        event_data: {
          expires_at: otpExpiresAt.toISOString(),
          source: "portal_resend",
        },
      });
    }

    if (qr_code_enabled && qrExpiresAtIso) {
      await supabaseAdmin.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "qr_code_generated",
        event_data: {
          expires_at: qrExpiresAtIso,
          source: "portal_resend",
        },
      });
    }

    return successResponse({
      arrival_otp_expires_at: otpExpiresAt?.toISOString(),
      qr_code_expires_at: qrExpiresAtIso,
      message: "Verification codes refreshed.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to refresh verification code");
  }
}
