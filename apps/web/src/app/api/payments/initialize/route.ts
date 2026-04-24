import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { generateTransactionReference } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { resolvePaymentTenantForBookingRequest } from "@/lib/bookings/resolve-payment-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveBookingPaystackAmount } from "@/lib/payments/resolve-paystack-initialize-amount";
import { revalidateBookingSlotBeforePayment } from "@/lib/bookings/revalidate-booking-slot-before-payment";
import { checkPaymentInitRateLimit } from "@/lib/rate-limit/payment-initialize";
import { getRateLimitHeaders } from "@/lib/rate-limit/headers";

/**
 * POST /api/payments/initialize
 * 
 * Initialize Paystack payment for a booking
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["customer"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const rateLimitResult = await checkPaymentInitRateLimit(request, auth.user?.id);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Too many payment requests. Please wait a moment before trying again.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    // §Customer-launch (audit 2026-04): pass `request` so Authorization
    // Bearer headers (mobile) are honoured — otherwise the RLS check on
    // the booking row below silently fails for every mobile Paystack
    // initialization and the user sees "Authentication required".
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { booking_id, currency, email, callback_url, metadata: clientMetadata } = body;
    const saveCard = clientMetadata?.save_card === true;
    const setAsDefault = clientMetadata?.set_as_default === true;

    if (!booking_id || !email) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "booking_id and email are required",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // Verify booking belongs to user; use booking tenant for PSP + currency (immutable market for this booking).
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, customer_id, total_amount, status, tenant_id")
      .eq("id", booking_id)
      .eq("customer_id", auth.user.id)
      .single();

    if (!booking) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Booking not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const bookingData = booking as { tenant_id?: string | null; status?: string };
    const tenantResolved = await resolvePaymentTenantForBookingRequest(
      request,
      bookingData.tenant_id,
    );
    if (tenantResolved.ok === false) {
      return tenantResolved.response;
    }
    const { paymentTenantId } = tenantResolved;
    const tenantRegion = await getTenantRegionConfig(paymentTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    if (bookingData.status !== "pending") {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Booking is not in pending status",
            code: "INVALID_STATUS",
          },
        },
        { status: 400 }
      );
    }

    const resolved = await resolveBookingPaystackAmount(supabase, booking_id, auth.user.id);
    if (resolved.ok === false) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: resolved.message,
            code: resolved.code,
          },
        },
        { status: resolved.status },
      );
    }

    const admin = getSupabaseAdmin();
    const slotOk = await revalidateBookingSlotBeforePayment(admin, booking_id);
    if (slotOk.ok === false) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: slotOk.message,
            code: slotOk.code,
          },
        },
        { status: 409 },
      );
    }

    const amountInSmallestUnit = resolved.amountSmallestUnit;
    const transactionReference = generateTransactionReference("booking", booking_id);

    // Get platform settings for split code (transaction split for commission)
    const { data: platformSettings } = await (supabase
      .from("platform_settings") as any)
      .select("settings")
      .single();

    const payoutSettings = platformSettings?.settings?.payouts;
    let splitCode: string | undefined;

    // Get active split code if transaction splits are configured
    if (payoutSettings?.use_transaction_splits) {
      const { data: activeSplit } = await (supabase
        .from("paystack_splits") as any)
        .select("split_code")
        .eq("active", true)
        .eq("currency", currency || lastResortCurrency)
        .single();

      if (activeSplit) {
        splitCode = activeSplit.split_code;
      }
    }

    // Get provider subaccount if provider-specific split is needed
    const { data: bookingDetails } = await (supabase
      .from("bookings") as any)
      .select("provider_id")
      .eq("id", booking_id)
      .single();

    let subaccount: string | undefined;
    if (bookingDetails?.provider_id) {
      const { data: providerSubaccount } = await (supabase
        .from("provider_paystack_subaccounts") as any)
        .select("subaccount_code")
        .eq("provider_id", bookingDetails.provider_id)
        .eq("active", true)
        .single();

      if (providerSubaccount) {
        subaccount = providerSubaccount.subaccount_code;
      }
    }

    // Initialize transaction with split if configured
    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit,
      currency: currency || lastResortCurrency,
      reference: transactionReference,
      callback_url: callback_url || `${process.env.NEXT_PUBLIC_APP_URL || ""}/checkout/success`,
      metadata: {
        booking_id,
        customer_id: auth.user.id,
        save_card: saveCard,
        set_as_default: setAsDefault,
        custom_fields: [
          {
            display_name: "Booking ID",
            variable_name: "booking_id",
            value: booking_id,
          },
        ],
      },
      ...(splitCode ? { split_code: splitCode } : {}),
      ...(subaccount ? { subaccount } : {}),
      tenantId: paymentTenantId,
    });

    // Store payment reference in booking
    await (supabase
      .from("bookings") as any)
      .update({
        payment_reference: paystackData.data.reference,
        payment_status: "pending",
      })
      .eq("id", booking_id);

    return NextResponse.json({
      data: {
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
        reference: paystackData.data.reference,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/payments/initialize:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to initialize payment",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
