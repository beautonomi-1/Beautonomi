import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { bookingTenantMismatchResponse } from "@/lib/tenant/provider-matches-host";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";
import { requireYocoPlatformEnabledForProvider } from "@/lib/payments/yoco-feature-gate";

/**
 * POST /api/provider/bookings/[id]/mark-paid
 * 
 * Mark a booking as paid (cash/card/other payment method)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { id: bookingId } = await params;

    // Proxy group:UUID ids — mark-paid maps to group-bookings endpoint
    if (bookingId.startsWith("group:")) {
      const groupId = bookingId.slice("group:".length);
      const groupUrl = new URL(`/api/provider/group-bookings/${groupId}`, request.url);
      groupUrl.searchParams.set("action", "mark_paid");
      return NextResponse.redirect(groupUrl, 307);
    }
    const body = await request.json();

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Validate input
    const {
      payment_method,
      amount,
      notes,
      reference,
      payment_provider,
      idempotency_key,
    } = body;

    if (
      payment_provider === "paystack_virtual_terminal" ||
      payment_provider === "paystack_terminal" ||
      payment_method === "paystack_terminal"
    ) {
      return errorResponse(
        "Paystack Terminal payments must be verified by Paystack and allocated from the terminal payment inbox.",
        "PAYSTACK_TERMINAL_ALLOCATION_REQUIRED",
        400,
      );
    }

    if (payment_provider === "yoco") {
      const yocoGate = await requireYocoPlatformEnabledForProvider(supabase, providerId);
      if (yocoGate) return yocoGate;
    }

    const validPaymentMethods = ['cash', 'card', 'bank_transfer', 'other'];
    const effectivePaymentMethod = payment_method === 'mobile' ? 'other' : payment_method;
    if (!payment_method || !validPaymentMethods.includes(effectivePaymentMethod)) {
      return errorResponse(
        "Valid payment_method is required (cash, card, bank_transfer, other)",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify booking exists and belongs to provider
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, status, tenant_id, total_amount, total_refunded, payment_status, provider_id, customer_id, booking_number, ref_number, total_paid, wallet_amount, gift_card_amount, tip_amount, travel_fee, tax_amount, service_fee_amount, booking_source, location_id, location_type, additional_charges(amount,status)")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const bookingMarketMismatch = bookingTenantMismatchResponse(
      tenantId,
      (booking as { tenant_id?: string | null }).tenant_id,
    );
    if (bookingMarketMismatch) return bookingMarketMismatch;

    const bookingStatus = (booking as { status?: string }).status ?? "";
    if (["cancelled", "refunded", "no_show"].includes(bookingStatus)) {
      return errorResponse(
        `Cannot record payment for a booking with status "${bookingStatus}"`,
        "INVALID_STATUS",
        400
      );
    }
    // Guard: allow front-desk / walk-in collection while appointment is still scheduled
    // (pending / booked / confirmed), in service, or completed — but not cancelled flows.
    const validPaymentStatuses = [
      "pending",
      "booked",
      "confirmed",
      "waiting",
      "checked_in",
      "started",
      "in_progress",
      "completed",
    ];
    if (bookingStatus && !validPaymentStatuses.includes(bookingStatus)) {
      return errorResponse(
        `Cannot record payment for a booking with status "${bookingStatus}"`,
        "INVALID_STATUS",
        400
      );
    }

    const { format: formatMoney } = await getTenantMoneyFormatter(
      (booking as { tenant_id?: string | null }).tenant_id ?? tenantId,
    );

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

    // If booking is missing location_id and it's an at_salon booking, set it to provider's first location
    if (!booking.location_id && booking.location_type === "at_salon") {
      const { data: providerLocations } = await supabaseAdmin
        .from("provider_locations")
        .select("id")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: true })
        .limit(1);
      
      if (providerLocations && providerLocations.length > 0) {
        const defaultLocationId = providerLocations[0].id;
        const { error: updateError } = await supabaseAdmin
          .from("bookings")
          .update({ location_id: defaultLocationId })
          .eq("id", bookingId);
        
        if (!updateError) {
          console.log(`Updated booking ${bookingId} with location_id ${defaultLocationId}`);
        } else {
          console.warn(`Failed to update location_id for booking ${bookingId}:`, updateError);
        }
      }
    }

    const currentTotalPaid = booking.total_paid || 0;
    const totalRefunded = Number((booking as any).total_refunded || 0);
    const walletAlreadyApplied = Number((booking as any).wallet_amount || 0);
    const giftCardAlreadyApplied = Number((booking as any).gift_card_amount || 0);
    const bookingTotal = booking.total_amount || 0;
    const effectivePaid = Math.max(0, currentTotalPaid - totalRefunded);
    /**
     * §Finance-truth 2026-05: post-migration 582 `total_paid` already includes
     * wallet + gift booking_payments rows, so subtracting wallet/gift again
     * double-subtracts and lets us under-charge the remaining balance.
     * Use the LARGER of effective_paid and (wallet+gift) to remain correct
     * for legacy rows that pre-date 582 yet had no synthetic booking_payments.
     */
    const walletGiftCoverage = walletAlreadyApplied + giftCardAlreadyApplied;
    const coverage = Math.max(effectivePaid, walletGiftCoverage);
    const remainingBalance = bookingTotal - coverage;
    const unpaidAdditionalCharges = Array.isArray((booking as any).additional_charges)
      ? (booking as any).additional_charges
          .filter((charge: any) => charge?.status !== "paid" && charge?.status !== "rejected")
          .reduce((sum: number, charge: any) => sum + Number(charge?.amount || 0), 0)
      : 0;
    
    if (remainingBalance <= 0) {
      if (unpaidAdditionalCharges > 0) {
        return errorResponse(
          `Base booking is settled, but ${formatMoney(unpaidAdditionalCharges)} in additional charges is still unpaid. Settle those charges from the Additional Charges section.`,
          "ADDITIONAL_CHARGES_DUE",
          400
        );
      }
      return errorResponse(
        "Booking is already fully paid (including wallet/gift card credits)",
        "ALREADY_PAID",
        400
      );
    }

    let paymentAmount: number;
    if (amount) {
      if (amount > remainingBalance) {
        paymentAmount = remainingBalance;
        console.warn(`Clamped payment amount from ${amount} to remaining balance ${remainingBalance} to prevent overpayment.`);
      } else {
        paymentAmount = amount;
      }
    } else {
      paymentAmount = remainingBalance;
    }

    if (paymentAmount <= 0) {
      return errorResponse(
        "No balance due — booking is already settled via wallet or gift card credits",
        "ALREADY_PAID",
        400
      );
    }

    const stableReference =
      typeof reference === "string" && reference.trim()
        ? reference.trim()
        : typeof idempotency_key === "string" && idempotency_key.trim()
          ? idempotency_key.trim()
          : request.headers.get("Idempotency-Key")?.trim() || null;

    let paymentProvider = 'other';
    if (effectivePaymentMethod === 'cash') {
      paymentProvider = 'cash';
    } else if (effectivePaymentMethod === 'card') {
      paymentProvider = payment_provider === "yoco" ? "yoco" : "other";
    }

    if (paymentProvider === "yoco" && !stableReference) {
      return errorResponse(
        "Yoco terminal payments require a stable payment reference or Idempotency-Key",
        "YOCO_REFERENCE_REQUIRED",
        400
      );
    }

    let payment: any = null;
    let paymentError: any = null;

    if (stableReference) {
      const { data: existingPayment, error: existingPaymentError } = await supabaseAdmin
        .from("booking_payments")
        .select()
        .eq("payment_provider", paymentProvider)
        .eq("payment_provider_id", stableReference)
        .maybeSingle();

      if (existingPaymentError) {
        return errorResponse(
          existingPaymentError.message || "Could not verify existing payment reference",
          "PAYMENT_REFERENCE_LOOKUP_ERROR",
          500,
          existingPaymentError
        );
      }

      if (existingPayment) {
        return successResponse({
          payment: existingPayment,
          message: "Payment already recorded"
        });
      }
    }

    if (!stableReference) {
      try {
      const { data: rpcPayment, error: rpcError } = await supabaseAdmin.rpc(
        'create_booking_payment',
        {
          p_booking_id: bookingId,
          p_amount: paymentAmount,
          p_payment_method: effectivePaymentMethod,
          p_payment_provider: paymentProvider,
          p_status: 'completed',
          p_notes: notes || `Payment received via ${payment_method}`,
          p_created_by: user.id,
          p_reference: stableReference || null,
        }
      );

      if (!rpcError && rpcPayment) {
        payment = Array.isArray(rpcPayment) ? rpcPayment[0] : rpcPayment;
      } else if (rpcError && !rpcError.message?.includes('function') && !rpcError.message?.includes('does not exist')) {
        paymentError = rpcError;
      }
      } catch {
        console.log("RPC function not available, using direct insert");
      }
    }

    if (!payment && !paymentError) {
      const bookingTenantId = (booking as { tenant_id?: string | null }).tenant_id;
      const paymentData: any = {
        booking_id: bookingId,
        amount: paymentAmount,
        payment_method: effectivePaymentMethod,
        payment_provider: paymentProvider,
        status: 'completed',
        notes: notes || `Payment received via ${payment_method}`,
        created_by: user.id,
        ...(bookingTenantId ? { tenant_id: bookingTenantId } : {}),
      };

      if (stableReference) {
        paymentData.payment_provider_id = stableReference;
        paymentData.payment_provider_data = {
          source: paymentProvider === "yoco" ? "provider_mark_paid_yoco_terminal" : "provider_mark_paid",
          reference: stableReference,
          idempotency_key:
            typeof idempotency_key === "string" && idempotency_key.trim()
              ? idempotency_key.trim()
              : request.headers.get("Idempotency-Key")?.trim() || null,
        };
      }
      
      // Try insert with status
      const { data: paymentInserted, error: insertError } = await supabaseAdmin
        .from("booking_payments")
        .insert(paymentData)
        .select()
        .single();
      
      if (insertError) {
        // If insert fails due to status enum, try without status and update after
        if (insertError.message?.includes('status') || insertError.message?.includes('enum')) {
          delete paymentData.status;
          const { data: paymentWithoutStatus, error: insertError2 } = await supabaseAdmin
            .from("booking_payments")
            .insert(paymentData)
            .select()
            .single();
          
          if (insertError2) {
            paymentError = insertError2;
          } else {
            payment = paymentWithoutStatus;
            // Update status after insert
            const { error: updateError } = await supabaseAdmin
              .from("booking_payments")
              .update({ status: 'completed' })
              .eq("id", payment.id);
            
            if (updateError) {
              console.warn("Failed to update payment status after insert:", updateError);
              // Payment was created but status might not be set - trigger should still work
            } else {
              // Refresh to get updated status
              const { data: updated } = await supabaseAdmin
                .from("booking_payments")
                .select()
                .eq("id", payment.id)
                .single();
              if (updated) payment = updated;
            }
          }
        } else {
          if (insertError.code === "23505" && stableReference) {
            const { data: existingPayment } = await supabaseAdmin
              .from("booking_payments")
              .select()
              .eq("payment_provider", paymentProvider)
              .eq("payment_provider_id", stableReference)
              .maybeSingle();
            if (existingPayment) {
              payment = existingPayment;
            } else {
              paymentError = insertError;
            }
          } else {
            paymentError = insertError;
          }
        }
      } else {
        payment = paymentInserted;
        
        // Verify status is set correctly
        if (payment && payment.status !== 'completed') {
          const { error: updateError } = await supabaseAdmin
            .from("booking_payments")
            .update({ status: 'completed' })
            .eq("id", payment.id);
          
          if (!updateError) {
            // Refresh to get updated status
            const { data: updated } = await supabaseAdmin
              .from("booking_payments")
              .select()
              .eq("id", payment.id)
              .single();
            if (updated) payment = updated;
          }
        }
      }
    }
    
    if (paymentError || !payment) {
      console.error("Error creating payment record:", paymentError);
      const errorMessage = paymentError?.message || "Failed to create payment record";
      const errorDetails = paymentError?.details || paymentError;
      
      // Provide helpful error message for enum type issues
      if (errorMessage.includes('payment_status') && errorMessage.includes('enum')) {
        return errorResponse(
          `Database enum error: The payment_status trigger needs to be updated to cast enum values properly. Please run migration 140_fix_payment_status_enum_cast.sql to fix this. Error: ${errorMessage}`,
          "PAYMENT_ENUM_ERROR",
          500,
          errorDetails
        );
      }
      
      return errorResponse(
        errorMessage,
        "PAYMENT_CREATE_ERROR",
        500,
        errorDetails
      );
    }

    // Record booking event for audit trail
    try {
      await supabaseAdmin.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "payment_received",
        event_data: {
          payment_id: payment.id,
          amount: paymentAmount,
          payment_method,
          reference: stableReference || null,
        },
        created_by: user.id,
      });
    } catch (eventErr) {
      console.warn("Failed to create payment booking event:", eventErr);
    }

    // Verify payment was created with correct status and amount
    if (payment.status !== 'completed') {
      console.warn(`Payment created with status '${payment.status}' instead of 'completed'. Attempting to fix...`);
      const { error: fixError } = await supabaseAdmin
        .from("booking_payments")
        .update({ status: 'completed' })
        .eq("id", payment.id);
      
      if (fixError) {
        console.error("Failed to fix payment status:", fixError);
      } else {
        // Refresh payment to get updated status
        const { data: updatedPayment } = await supabaseAdmin
          .from("booking_payments")
          .select()
          .eq("id", payment.id)
          .single();
        if (updatedPayment) {
          payment = updatedPayment;
        }
      }
    }

    // Verify the trigger updated the booking correctly. PostgreSQL row triggers run
    // in the same statement, so this must be visible immediately.
    const { data: updatedBooking } = await supabaseAdmin
      .from("bookings")
      .select("total_paid, payment_status")
      .eq("id", bookingId)
      .single();
    
    if (updatedBooking) {
      console.log(
        `Payment created: ${formatMoney(paymentAmount)}. Booking total_paid: ${formatMoney(updatedBooking.total_paid || 0)}, status: ${updatedBooking.payment_status}`,
      );

      // If total_paid doesn't match expected, log warning
      const expectedTotalPaid = (currentTotalPaid || 0) + paymentAmount;
      if (Math.abs((updatedBooking.total_paid || 0) - expectedTotalPaid) > 0.01) {
        console.warn(
          `Payment trigger may not have fired correctly. Expected total_paid: ${formatMoney(expectedTotalPaid)}, Actual: ${formatMoney(updatedBooking.total_paid || 0)}`,
        );
      }
    }

    // Finance ledger entries are created automatically by the DB trigger
    // (create_finance_ledger_from_payment) when booking_payments rows are inserted.
    // The trigger (migration 458) handles:
    //   - proportional commission based on actual payment amount
    //   - per-payment idempotency via source_payment_id
    //   - booking-level items (tip/tax/travel/service_fee) only once per booking
    //   - live commission rate from platform_settings
    //   - correct handling of 'online', 'walk_in', and 'provider' booking sources
    // No app-level finance_transactions creation needed here.

    // Lifecycle reconciliation: if this mark-paid clears outstanding for a
    // booking that is still in `pending_payment` (rare, but possible if the
    // online payment never completed and provider is recording cash), advance
    // the lifecycle and apply the auto-confirm policy. Migration 595 also does
    // this at the DB layer (advancing pending_payment → pending), but
    // syncBookingAfterPaystackSuccess additionally honours the provider's
    // require_confirmation_for_bookings setting (so auto-confirming providers
    // jump straight to `confirmed`).
    try {
      const { syncBookingAfterPaystackSuccess } = await import(
        "@/lib/bookings/sync-booking-after-paystack-success"
      );
      await syncBookingAfterPaystackSuccess(supabaseAdmin, bookingId);
    } catch (syncErr) {
      console.warn(
        "[mark-paid] post-payment booking lifecycle sync failed:",
        syncErr,
      );
    }

    // Create notification for customer (will be sent via OneSignal)
    try {
      const { insertNotification } = await import("@/lib/notifications/insert-notification");
      await insertNotification({
        user_id: booking.customer_id,
        type: "payment_received",
        title: "Payment Confirmed",
        message: `Your payment of ${formatMoney(paymentAmount)} has been received and confirmed.`,
        data: {
          booking_id: bookingId,
          payment_id: payment.id,
          amount: paymentAmount,
          payment_method,
        },
        action_url: `/account-settings/bookings/${bookingId}`,
      });

      // Send push notification via OneSignal using template
      try {
        const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
        const bookingRef = booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();
        await sendTemplateNotification(
          "payment_successful",
          [booking.customer_id],
          {
            amount: formatMoney(paymentAmount),
            booking_number: bookingRef,
            payment_method: payment_method,
            transaction_id: payment.id,
            booking_id: bookingId,
          },
          ["push", "email"],
          // In-app bell row inserted manually above; skip template auto-insert.
          { appType: "customer", skipInApp: true }
        );
      } catch (pushError) {
        console.warn("OneSignal push notification failed:", pushError);
      }
    } catch (notifError) {
      console.warn("Failed to create payment notification:", notifError);
    }

    return successResponse({ 
      payment,
      message: "Booking marked as paid successfully" 
    });
  } catch (error) {
    return handleApiError(error, "Failed to mark booking as paid");
  }
}
