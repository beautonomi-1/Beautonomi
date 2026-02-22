import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";
import type { Booking } from "@/types/beautonomi";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";

const payAdditionalSchema = z.object({
  charge_id: z.string().uuid(),
  payment_method: z.string().optional(),
});

/**
 * POST /api/me/bookings/[id]/pay-additional
 * 
 * Process payment for approved additional charge
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer();
    const { id } = await params;
    const body = await request.json();

    const validationResult = payAdditionalSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { charge_id, payment_method } = validationResult.data;

    // Get booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .eq("customer_id", user.id)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const bookingData = booking as any;

    // Get charge row from real table
    const { data: charge, error: chargeError } = await (supabase
      .from("additional_charges") as any)
      .select("*")
      .eq("id", charge_id)
      .eq("booking_id", id)
      .single();

    if (chargeError || !charge) {
      return notFoundResponse("Charge not found");
    }

    // Check if charge is approved
    if ((charge as any).status !== "approved") {
      return errorResponse("Charge must be approved before payment", "INVALID_STATUS", 400);
    }

    // Initialize Paystack payment for the additional charge
    const { data: userEmailRow } = await supabase
      .from("users")
      .select("email")
      .eq("id", bookingData.customer_id)
      .single();

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    const email = userEmailRow?.email || authUser?.email;
    if (!email) {
      return errorResponse("User email is required for payment", "VALIDATION_ERROR", 400);
    }

    const reference = generateTransactionReference("additional", `${id}:${charge_id}`);
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/checkout/success`;

    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: convertToSmallestUnit(Number((charge as any).amount || 0)),
      currency: (charge as any).currency || bookingData.currency || "ZAR",
      reference,
      callback_url: callbackUrl,
      metadata: {
        booking_id: id,
        additional_charge_id: charge_id,
        customer_id: bookingData.customer_id,
      },
    });

    const paymentUrl = paystackData?.data?.authorization_url || null;

    // Create a payments row for tracking (do NOT overwrite booking.payment_reference)
    await (supabase.from("payments") as any).insert({
      booking_id: id,
      user_id: bookingData.customer_id,
      provider_id: bookingData.provider_id,
      payment_number: "",
      amount: Number((charge as any).amount || 0),
      currency: (charge as any).currency || bookingData.currency || "ZAR",
      status: "pending",
      payment_provider: "paystack",
      payment_provider_transaction_id: reference,
      payment_provider_response: paystackData,
      description: `Additional charge for booking ${bookingData.booking_number}`,
      metadata: {
        type: "additional_charge",
        additional_charge_id: charge_id,
        payment_method: payment_method || null,
      },
    });

    // Create booking event
    await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "additional_payment_initiated",
        event_data: {
          charge_id,
          amount: (charge as any).amount,
          payment_method,
          reference,
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
      payment_url: paymentUrl,
      reference,
      message: "Additional payment initiated successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to process payment");
  }
}
