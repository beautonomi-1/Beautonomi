import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { generateOTP, getOTPExpiry } from "@/lib/otp/generator";
import { sendOTPToCustomer } from "@/lib/otp/notifications";
import { generateVerificationCode, getQRCodeExpiry, type QRCodeData } from "@/lib/qr/generator";
import { getVerificationSettings } from "@/lib/platform-settings";
import { NextResponse } from "next/server";
import type { Booking } from "@/types/beautonomi";

const RESEND_COOLDOWN_SECONDS = 90;

/**
 * POST /api/provider/bookings/[id]/resend-arrival-otp
 *
 * Regenerate arrival PIN and send to customer. Rate limited to once per 90 seconds per booking.
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

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

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

    const supabaseAdminResend = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdminResend,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
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

    if (qr_code_enabled) {
      const qrVerificationCode = generateVerificationCode();
      const qrExpiresAt = getQRCodeExpiry();
      const qrExpiresAtIso = qrExpiresAt.toISOString();
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

    const { error: updateErr } = await supabase.from("bookings").update(updatePayload).eq("id", id);
    if (updateErr) {
      throw updateErr;
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

    if (qr_code_enabled) {
      await supabase.from("booking_events").insert({
        booking_id: id,
        event_type: "qr_code_generated",
        event_data: { source: "provider_resend" },
        created_by: user.id,
      });
    }

    const { data: provider } = await supabase
      .from("providers")
      .select("business_name")
      .eq("id", providerId)
      .single();

    const customer = bookingData.customers;
    if (customer && otp_enabled && otp) {
      try {
        await sendOTPToCustomer({
          customerId: customer.id,
          phone: customer.phone || "",
          email: customer.email || "",
          otp,
          bookingId: id,
          bookingNumber: bookingData.booking_number,
          providerName: (provider as any)?.business_name || "Provider",
          customerName: customer.full_name || "Customer",
        });
      } catch (otpError) {
        console.error("Failed to send OTP on resend:", otpError);
      }
    }

    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      message: "New code sent to customer.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to resend code");
  }
}
