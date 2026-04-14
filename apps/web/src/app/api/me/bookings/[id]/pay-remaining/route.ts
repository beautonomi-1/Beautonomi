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
import { resolvePaymentTenantForBookingRequest } from "@/lib/bookings/resolve-payment-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * POST /api/me/bookings/[id]/pay-remaining
 *
 * Initiate Paystack payment for the outstanding booking balance:
 * - `partially_paid` (deposit already taken), or
 * - `pending` (nothing paid yet; e.g. pay-by-link / invoice flow).
 * Webhook: `payment_type` = `booking_remaining` → handleBookingRemainingSuccess.
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
        "id, customer_id, total_amount, total_paid, wallet_amount, gift_card_amount, payment_status, currency, booking_number, ref_number, status, tenant_id, additional_charges:additional_charges(id, amount, status)"
      )
      .eq("id", bookingId)
      .eq("customer_id", user.id)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const tenantResolved = await resolvePaymentTenantForBookingRequest(
      request,
      (booking as { tenant_id?: string | null }).tenant_id,
    );
    if (tenantResolved.ok === false) {
      return tenantResolved.response;
    }
    const { paymentTenantId } = tenantResolved;
    const tenantRegion = await getTenantRegionConfig(paymentTenantId);

    if (booking.status === "cancelled") {
      return errorResponse(
        "Cannot pay for a cancelled booking",
        "BOOKING_CANCELLED",
        400
      );
    }

    const totalAmount = Number(booking.total_amount ?? 0);
    const totalPaid = Number(booking.total_paid ?? 0);
    const walletAmount = Number((booking as Record<string, unknown>).wallet_amount ?? 0);
    const giftCardAmount = Number((booking as Record<string, unknown>).gift_card_amount ?? 0);
    type AcRow = { id: string; amount: number; status: string };
    const unpaidAdditionalCharges = ((booking as unknown as { additional_charges?: AcRow[] }).additional_charges ?? [])
      .filter((ac) => ac.status !== "paid" && ac.status !== "rejected")
      .reduce((sum, ac) => sum + Number(ac.amount ?? 0), 0);
    const remaining = totalAmount + unpaidAdditionalCharges - totalPaid - walletAmount - giftCardAmount;

    if (remaining <= 0) {
      return errorResponse(
        "No remaining balance to pay",
        "NO_REMAINING_BALANCE",
        400
      );
    }

    const ps = booking.payment_status as string;
    /** Outstanding Paystack / online payment: deposit (partial) or not yet paid (pending). */
    if (ps !== "partially_paid" && ps !== "pending") {
      return errorResponse(
        "Online payment is not available for this booking’s current payment state",
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

    const currency = booking.currency || tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;
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
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com"}/account-settings/bookings/${bookingId}/payment-callback?pay_remaining=1`,
      tenantId: paymentTenantId,
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
