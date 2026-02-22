import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import {
  convertToSmallestUnit,
  validateAmount,
  generateTransactionReference,
} from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";

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

    const supabase = await getSupabaseServer();
    const body = await request.json();
    const { booking_id, amount, currency, email, callback_url, metadata: clientMetadata } = body;
    const saveCard = clientMetadata?.save_card === true;
    const setAsDefault = clientMetadata?.set_as_default === true;

    if (!booking_id || !amount || !email) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "booking_id, amount, and email are required",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // Verify booking belongs to user
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, customer_id, total_amount, status")
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

    const bookingData = booking as any;

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

    // Validate amount
    const amountValidation = validateAmount(parseFloat(amount));
    if (!amountValidation.valid) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: amountValidation.error || "Invalid amount",
            code: "INVALID_AMOUNT",
          },
        },
        { status: 400 }
      );
    }

    // Convert amount to smallest currency unit (kobo/cents)
    const amountInSmallestUnit = convertToSmallestUnit(parseFloat(amount));
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
        .eq("currency", currency || "ZAR")
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
      currency: currency || "ZAR",
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
