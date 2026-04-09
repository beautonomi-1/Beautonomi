import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { resolvePaymentTenantForBookingRequest } from "@/lib/bookings/resolve-payment-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * POST /api/me/bookings/[id]/additional-charges/[chargeId]/pay
 * 
 * Initiate Paystack payment for an additional charge
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer'], request);
    const supabase = await getSupabaseServer(request);
    const { id: bookingId, chargeId } = await params;
    const _body = await request.json();

    // Verify booking belongs to customer
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, customer_id, currency, booking_number, ref_number, tenant_id")
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
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Get additional charge
    const { data: charge, error: chargeError } = await supabase
      .from("additional_charges")
      .select("*")
      .eq("id", chargeId)
      .eq("booking_id", bookingId)
      .single();

    if (chargeError || !charge) {
      return notFoundResponse("Additional charge not found");
    }

    // Verify charge can be paid
    if (charge.status === 'paid') {
      return errorResponse(
        "This charge has already been paid",
        "ALREADY_PAID",
        400
      );
    }

    if (charge.status === 'rejected') {
      return errorResponse(
        "This charge has been rejected",
        "CHARGE_REJECTED",
        400
      );
    }

    // Get customer email
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

    const amount = Number(charge.amount);
    const currency = charge.currency || booking.currency || lastResortCurrency;
    const amountInSmallestUnit = convertToSmallestUnit(amount);
    const reference = generateTransactionReference("charge", chargeId);

    // Initialize Paystack transaction
    const paystackResponse = await initializePaystackTransaction({
      email: customer.email,
      amountInSmallestUnit,
      currency: currency,
      reference: reference,
      metadata: {
        booking_id: bookingId,
        booking_number: booking.booking_number || booking.ref_number || bookingId.slice(0, 8).toUpperCase(),
        charge_id: chargeId,
        additional_charge_id: chargeId,
        charge_description: charge.description,
        customer_id: user.id,
        payment_type: "additional_charge",
      },
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com"}/account-settings/bookings/${bookingId}/payment-callback?charge_id=${chargeId}`,
      tenantId: paymentTenantId,
    });

    if (!paystackResponse.data?.authorization_url) {
      throw new Error("Failed to generate payment link");
    }

    // Update charge status to 'approved' (ready for payment)
    await supabase
      .from("additional_charges")
      .update({ status: 'approved' })
      .eq("id", chargeId);

    // Create booking event
    await supabase
      .from("booking_events")
      .insert({
        booking_id: bookingId,
        event_type: "additional_payment_initiated",
        event_data: {
          charge_id: chargeId,
          description: charge.description,
          amount: amount,
          reference: reference,
        },
        created_by: user.id,
      });

    return successResponse({
      authorization_url: paystackResponse.data?.authorization_url ?? "",
      access_code: paystackResponse.data?.access_code ?? "",
      reference: reference,
    });
  } catch (error) {
    return handleApiError(error, "Failed to initiate payment");
  }
}
