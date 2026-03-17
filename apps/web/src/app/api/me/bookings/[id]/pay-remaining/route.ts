import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import {
  convertToSmallestUnit,
  generateTransactionReference,
} from "@/lib/payments/paystack";

/**
 * POST /api/me/bookings/[id]/pay-remaining
 *
 * Initiate Paystack payment for the outstanding booking balance
 * (e.g. when the customer only paid a deposit and payment_status is partially_paid).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["customer"], request);
    const supabase = await getSupabaseServer(request);
    const { id: bookingId } = await params;

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        "id, customer_id, total_amount, total_paid, payment_status, currency, booking_number, ref_number"
      )
      .eq("id", bookingId)
      .eq("customer_id", user.id)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const totalAmount = Number(booking.total_amount ?? 0);
    const totalPaid = Number(booking.total_paid ?? 0);
    const remaining = totalAmount - totalPaid;

    if (remaining <= 0) {
      return errorResponse(
        "No remaining balance to pay",
        "NO_REMAINING_BALANCE",
        400
      );
    }

    if (booking.payment_status !== "partially_paid") {
      return errorResponse(
        "Pay remaining balance is only available for deposit-paid bookings",
        "INVALID_STATUS",
        400
      );
    }

    const { data: customer } = await supabase
      .from("users")
      .select("email, full_name")
      .eq("id", user.id)
      .single();

    if (!customer?.email) {
      return errorResponse(
        "Customer email is required for payment",
        "MISSING_EMAIL",
        400
      );
    }

    const currency = booking.currency || "ZAR";
    const amountInSmallestUnit = convertToSmallestUnit(remaining);
    const reference = generateTransactionReference("remaining", bookingId);

    const paystackResponse = await initializePaystackTransaction({
      email: customer.email,
      amountInSmallestUnit,
      currency,
      reference,
      metadata: {
        booking_id: bookingId,
        booking_number: booking.booking_number || booking.ref_number || bookingId.slice(0, 8).toUpperCase(),
        customer_id: user.id,
        payment_type: "booking_remaining",
      },
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/account-settings/bookings/${bookingId}/payment-callback?pay_remaining=1`,
    });

    if (!paystackResponse.data?.authorization_url) {
      throw new Error("Failed to generate payment link");
    }

    return successResponse({
      authorization_url: paystackResponse.data.authorization_url ?? "",
      access_code: paystackResponse.data.access_code ?? "",
      reference,
    });
  } catch (error) {
    return handleApiError(error, "Failed to initiate pay remaining balance");
  }
}
