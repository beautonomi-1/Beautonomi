import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";

/**
 * POST /api/provider/bookings/[id]/additional-charges/[chargeId]/mark-paid
 * 
 * Mark an additional charge as paid (for walk-in/in-salon payments)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    // Check permission to process payments
    const permissionCheck = await requirePermission('process_payments', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    if (!user) return notFoundResponse("User not found");

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = await getSupabaseAdmin();
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { id: bookingId, chargeId } = await params;
    const body = await request.json();

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Validate input
    const { 
      payment_method, 
      notes,
      reference 
    } = body;

    const validPaymentMethods = ['cash', 'card', 'bank_transfer', 'other'];
    const effectiveMethod = payment_method === 'mobile' ? 'other' : payment_method;
    if (!payment_method || !validPaymentMethods.includes(effectiveMethod)) {
      return errorResponse(
        "Valid payment_method is required (cash, card, bank_transfer, other)",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify booking exists and belongs to provider
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, provider_id, tenant_id, customer_id, booking_number, ref_number, currency, total_amount, location_id")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    if (
      !resourceTenantMatchesHostTenant(
        tenantId,
        (booking as { tenant_id?: string | null }).tenant_id,
      )
    ) {
      return errorResponse(
        "This booking belongs to a different market. Use the provider site or app for the correct region.",
        "TENANT_MISMATCH",
        403,
      );
    }

    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdmin,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

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

    // Check if already paid
    if (charge.status === 'paid') {
      return errorResponse(
        "This charge has already been paid",
        "ALREADY_PAID",
        400
      );
    }

    const chargeAmount = Number(charge.amount);
    const currency = charge.currency || booking.currency || lastResortCurrency;

    let paymentProvider = 'other';
    if (effectiveMethod === 'cash') {
      paymentProvider = 'cash';
    } else if (effectiveMethod === 'card') {
      paymentProvider = 'yoco';
    }

    const bookingTenantId = (booking as { tenant_id?: string | null }).tenant_id;
    const paymentData: Record<string, unknown> = {
      booking_id: bookingId,
      amount: chargeAmount,
      payment_method: effectiveMethod,
      payment_provider: paymentProvider,
      status: 'completed',
      notes: notes || `Additional charge payment: ${charge.description} (via ${payment_method})`,
      created_by: user.id,
      ...(bookingTenantId ? { tenant_id: bookingTenantId } : {}),
      payment_provider_data: {
        additional_charge_id: chargeId,
        charge_description: charge.description,
      },
    };

    if (reference) {
      paymentData.payment_provider_id = reference;
    }

    // Insert payment record
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("booking_payments")
      .insert(paymentData)
      .select()
      .single();

    if (paymentError) {
      console.error("Error creating payment record:", paymentError);
      return errorResponse(
        paymentError.message || "Failed to create payment record",
        "PAYMENT_CREATE_ERROR",
        500
      );
    }

    // Update additional charge status to paid
    const { error: updateError } = await supabaseAdmin
      .from("additional_charges")
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq("id", chargeId);

    if (updateError) {
      console.error("Error updating charge status:", updateError);
      // Payment was created but charge status update failed - log but don't fail
    }

    // Update booking total_amount so booking total = services + all additional charges (aligned with Paystack flow)
    const bookingTotalAmount = Number((booking as any).total_amount || 0);
    const { error: bookingUpdateError } = await supabaseAdmin
      .from("bookings")
      .update({
        total_amount: bookingTotalAmount + chargeAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (bookingUpdateError) {
      console.warn("Error updating booking total_amount:", bookingUpdateError);
    }

    const walkInLedgerTenantId = await resolveTenantIdForFinanceLedger(supabaseAdmin, {
      tenant_id: (booking as { tenant_id?: string | null }).tenant_id ?? null,
      provider_id: (booking as { provider_id?: string | null }).provider_id ?? null,
    });

    // Audit/reporting ledger row (walk-in = provider took payment; not included in payout balance)
    await supabaseAdmin.from("finance_transactions").insert({
      booking_id: bookingId,
      provider_id: booking.provider_id,
      tenant_id: walkInLedgerTenantId,
      transaction_type: "walk_in_additional_charge",
      amount: chargeAmount,
      fees: 0,
      commission: 0,
      net: chargeAmount,
      description: `Walk-in additional charge: ${charge.description || "Add-on"}`,
      created_at: new Date().toISOString(),
    });

    // Create booking event
    await supabaseAdmin
      .from("booking_events")
      .insert({
        booking_id: bookingId,
        event_type: "additional_payment_paid",
        event_data: {
          charge_id: chargeId,
          description: charge.description,
          amount: chargeAmount,
          payment_method,
          payment_id: payment.id,
        },
        created_by: user.id,
      });

    // Notify customer
    try {
      const { insertNotification } = await import("@/lib/notifications/insert-notification");
      await insertNotification({
        user_id: booking.customer_id,
        type: "additional_charge_paid",
        title: "Additional Charge Paid",
        message: `Your additional charge of ${currency} ${chargeAmount.toFixed(2)} has been paid and confirmed.`,
        data: {
          booking_id: bookingId,
          charge_id: chargeId,
          amount: chargeAmount,
          payment_method,
        },
        action_url: `/account-settings/bookings/${bookingId}`,
      });

      // Send push notification
      try {
        const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
        const bookingRef = booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();
        await sendTemplateNotification(
          "payment_successful",
          [booking.customer_id],
          {
            amount: `${currency} ${chargeAmount.toFixed(2)}`,
            booking_number: bookingRef,
            payment_method: payment_method,
            transaction_id: payment.id,
            booking_id: bookingId,
            charge_description: charge.description,
          },
          ["push", "email"],
          { appType: "customer" }
        );
      } catch (pushError) {
        console.warn("OneSignal push notification failed:", pushError);
      }
    } catch (notifError) {
      console.warn("Failed to create payment notification:", notifError);
    }

    return successResponse({
      payment,
      charge: {
        ...charge,
        status: 'paid',
        paid_at: new Date().toISOString(),
      },
      message: "Additional charge marked as paid successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to mark additional charge as paid");
  }
}
