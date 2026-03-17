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
import { generateOTP, getOTPExpiry } from "@/lib/otp/generator";
import { sendOTPToCustomer } from "@/lib/otp/notifications";
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

    // Rate limit: check last otp_sent event
    const { data: lastOtpEvent } = await supabase
      .from("booking_events")
      .select("created_at")
      .eq("booking_id", id)
      .eq("event_type", "otp_sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastOtpEvent?.created_at) {
      const lastSent = new Date(lastOtpEvent.created_at).getTime();
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

    const otp = generateOTP();
    const otpExpiresAt = getOTPExpiry();

    await supabase
      .from("bookings")
      .update({
        arrival_otp: otp,
        arrival_otp_expires_at: otpExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    await supabase.from("booking_events").insert({
      booking_id: id,
      event_type: "otp_sent",
      event_data: {
        expires_at: otpExpiresAt.toISOString(),
      },
      created_by: user.id,
    });

    const { data: provider } = await supabase
      .from("providers")
      .select("business_name")
      .eq("id", providerId)
      .single();

    const customer = bookingData.customers;
    if (customer) {
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
