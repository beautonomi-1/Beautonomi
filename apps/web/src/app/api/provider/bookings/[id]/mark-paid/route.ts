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
import { requireManualCardEnabledForProvider } from "@/lib/payments/require-manual-card-enabled";

type AdditionalChargeRow = {
  id?: string;
  amount?: number;
  status?: string;
  description?: string | null;
  currency?: string | null;
};

async function settleUnpaidAdditionalChargesForMarkPaid(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  bookingId: string;
  providerId: string;
  tenantId: string;
  booking: {
    tenant_id?: string | null;
    customer_id: string;
    booking_number?: string | null;
    ref_number?: string | null;
    currency?: string | null;
  };
  userId: string;
  unpaidCharges: AdditionalChargeRow[];
  effectivePaymentMethod: string;
  paymentProvider: string;
  stableReference: string | null;
  formatMoney: (value: number) => string;
  paymentMethodLabel: string;
}): Promise<
  { charge_id: string; amount: number; description?: string | null; reference: string }[]
> {
  const {
    supabaseAdmin,
    bookingId,
    providerId,
    tenantId,
    booking,
    userId,
    unpaidCharges,
    effectivePaymentMethod,
    paymentProvider,
    stableReference,
    formatMoney,
    paymentMethodLabel,
  } = params;

  const settled: {
    charge_id: string;
    amount: number;
    description?: string | null;
    reference: string;
  }[] = [];

  for (const charge of unpaidCharges) {
    if (!charge.id) continue;
    const chargeAmount = Number(charge.amount ?? 0);
    const chargeRef =
      stableReference != null && stableReference !== ""
        ? `${stableReference}:charge:${charge.id}`
        : `mark_paid_settle:${bookingId}:${charge.id}:${effectivePaymentMethod}`;

    const { error: settlementError } = await supabaseAdmin.rpc(
      "record_walk_in_additional_charge_payment",
      {
        p_booking_id: bookingId,
        p_charge_id: charge.id,
        p_provider_id: providerId,
        p_tenant_id: booking.tenant_id ?? tenantId,
        p_payment_provider: paymentProvider,
        p_payment_method: effectivePaymentMethod,
        p_reference: chargeRef,
        p_created_by: userId,
      },
    );

    if (settlementError) {
      throw new Error(
        settlementError.message ||
          `Failed to settle additional charge ${charge.id}`,
      );
    }

    settled.push({
      charge_id: charge.id,
      amount: chargeAmount,
      description: charge.description ?? null,
      reference: chargeRef,
    });

    try {
      await supabaseAdmin.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "additional_payment_paid",
        event_data: {
          charge_id: charge.id,
          description: charge.description,
          amount: chargeAmount,
          payment_method: paymentMethodLabel,
          payment_reference: chargeRef,
          source: "provider_mark_paid_settle_all",
        },
        created_by: userId,
      });
    } catch (eventErr) {
      console.warn("Failed to create additional charge booking event:", eventErr);
    }

    const currency =
      charge.currency || booking.currency || "ZAR";
    try {
      const { insertNotification } = await import("@/lib/notifications/insert-notification");
      await insertNotification({
        user_id: booking.customer_id,
        type: "additional_charge_paid",
        title: "Additional Charge Paid",
        message: `Your additional charge of ${currency} ${chargeAmount.toFixed(2)} has been paid and confirmed.`,
        data: {
          booking_id: bookingId,
          charge_id: charge.id,
          amount: chargeAmount,
          payment_method: paymentMethodLabel,
        },
        action_url: `/account-settings/bookings/${bookingId}`,
      });

      try {
        const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
        const bookingRef =
          booking.ref_number ||
          booking.booking_number ||
          bookingId.slice(0, 8).toUpperCase();
        await sendTemplateNotification(
          "payment_successful",
          [booking.customer_id],
          {
            amount: formatMoney(chargeAmount),
            booking_number: bookingRef,
            payment_method: paymentMethodLabel,
            transaction_id: chargeRef,
            booking_id: bookingId,
            charge_description: charge.description ?? "",
          },
          ["push", "email"],
          { appType: "customer", skipInApp: true },
        );
      } catch (pushError) {
        console.warn("OneSignal push for additional charge failed:", pushError);
      }
    } catch (notifError) {
      console.warn("Failed to create additional charge payment notification:", notifError);
    }
  }

  return settled;
}

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
      settle_additional_charges,
    } = body;
    const settleAllCharges = settle_additional_charges === true;

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

    const manualCardGate = await requireManualCardEnabledForProvider(supabase, providerId, {
      payment_method,
      payment_provider,
    });
    if (manualCardGate) return manualCardGate;

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
      .select("id, status, tenant_id, total_amount, total_refunded, payment_status, provider_id, customer_id, booking_number, ref_number, total_paid, wallet_amount, gift_card_amount, tip_amount, travel_fee, tax_amount, service_fee_amount, booking_source, location_id, location_type, currency, additional_charges(id, amount, status, description, currency)")
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

    const paymentStatus = String((booking as { payment_status?: string }).payment_status ?? "").toLowerCase();
    if (paymentStatus === "refunded" && body?.confirm_recollect !== true) {
      return errorResponse(
        "This booking was fully refunded. Confirm you are recording a new payment before collecting again.",
        "REFUNDED_BOOKING",
        409,
        { requires_confirm_recollect: true },
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
    const unpaidChargeRows: AdditionalChargeRow[] = Array.isArray(
      (booking as { additional_charges?: AdditionalChargeRow[] }).additional_charges,
    )
      ? (booking as { additional_charges: AdditionalChargeRow[] }).additional_charges.filter(
          (charge) => charge?.status !== "paid" && charge?.status !== "rejected",
        )
      : [];
    const unpaidAdditionalCharges = unpaidChargeRows.reduce(
      (sum, charge) => sum + Number(charge?.amount || 0),
      0,
    );

    if (remainingBalance <= 0) {
      if (unpaidAdditionalCharges > 0) {
        if (!settleAllCharges) {
          return errorResponse(
            `Base booking is settled, but ${formatMoney(unpaidAdditionalCharges)} in additional charges is still unpaid. Settle those charges from the Additional Charges section.`,
            "ADDITIONAL_CHARGES_DUE",
            400,
          );
        }
      } else {
        return errorResponse(
          "Booking is already fully paid (including wallet/gift card credits)",
          "ALREADY_PAID",
          400,
        );
      }
    }

    let paymentAmount = 0;
    if (remainingBalance > 0) {
      if (amount) {
        if (amount > remainingBalance) {
          paymentAmount = remainingBalance;
          console.warn(
            `Clamped payment amount from ${amount} to remaining balance ${remainingBalance} to prevent overpayment.`,
          );
        } else {
          paymentAmount = amount;
        }
      } else {
        paymentAmount = remainingBalance;
      }
    }

    const baseFullySettledAfterPayment =
      remainingBalance <= 0 ||
      (paymentAmount > 0 && paymentAmount >= remainingBalance - 0.01);

    if (paymentAmount <= 0 && !(settleAllCharges && unpaidChargeRows.length > 0)) {
      return errorResponse(
        "No balance due — booking is already settled via wallet or gift card credits",
        "ALREADY_PAID",
        400,
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

    if (effectivePaymentMethod === "card" && paymentProvider !== "cash" && !stableReference) {
      return errorResponse(
        "Card payments require a stable payment reference or Idempotency-Key",
        "CARD_REFERENCE_REQUIRED",
        400
      );
    }

    let payment: any = null;
    let paymentError: any = null;
    let paymentAlreadyRecorded = false;

    if (paymentAmount > 0) {
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
            existingPaymentError,
          );
        }

        if (existingPayment) {
          payment = existingPayment;
          paymentAlreadyRecorded = true;
        }
      }

      if (!payment && !stableReference) {
        try {
          const { data: rpcPayment, error: rpcError } = await supabaseAdmin.rpc(
            "create_booking_payment",
            {
              p_booking_id: bookingId,
              p_amount: paymentAmount,
              p_payment_method: effectivePaymentMethod,
              p_payment_provider: paymentProvider,
              p_status: "completed",
              p_notes: notes || `Payment received via ${payment_method}`,
              p_created_by: user.id,
              p_reference: stableReference || null,
            },
          );

          if (!rpcError && rpcPayment) {
            payment = Array.isArray(rpcPayment) ? rpcPayment[0] : rpcPayment;
          } else if (
            rpcError &&
            !rpcError.message?.includes("function") &&
            !rpcError.message?.includes("does not exist")
          ) {
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
          status: "completed",
          notes: notes || `Payment received via ${payment_method}`,
          created_by: user.id,
          ...(bookingTenantId ? { tenant_id: bookingTenantId } : {}),
        };

        if (stableReference) {
          paymentData.payment_provider_id = stableReference;
          paymentData.payment_provider_data = {
            source:
              paymentProvider === "yoco"
                ? "provider_mark_paid_yoco_terminal"
                : "provider_mark_paid",
            reference: stableReference,
            idempotency_key:
              typeof idempotency_key === "string" && idempotency_key.trim()
                ? idempotency_key.trim()
                : request.headers.get("Idempotency-Key")?.trim() || null,
          };
        }

        const { data: paymentInserted, error: insertError } = await supabaseAdmin
          .from("booking_payments")
          .insert(paymentData)
          .select()
          .single();

        if (insertError) {
          if (insertError.message?.includes("status") || insertError.message?.includes("enum")) {
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
              const { error: updateError } = await supabaseAdmin
                .from("booking_payments")
                .update({ status: "completed" })
                .eq("id", payment.id);

              if (!updateError) {
                const { data: updated } = await supabaseAdmin
                  .from("booking_payments")
                  .select()
                  .eq("id", payment.id)
                  .single();
                if (updated) payment = updated;
              }
            }
          } else if (insertError.code === "23505" && stableReference) {
            const { data: existingPayment } = await supabaseAdmin
              .from("booking_payments")
              .select()
              .eq("payment_provider", paymentProvider)
              .eq("payment_provider_id", stableReference)
              .maybeSingle();
            if (existingPayment) {
              payment = existingPayment;
              paymentAlreadyRecorded = true;
            } else {
              paymentError = insertError;
            }
          } else {
            paymentError = insertError;
          }
        } else {
          payment = paymentInserted;
          if (payment && payment.status !== "completed") {
            const { error: updateError } = await supabaseAdmin
              .from("booking_payments")
              .update({ status: "completed" })
              .eq("id", payment.id);

            if (!updateError) {
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

        if (errorMessage.includes("payment_status") && errorMessage.includes("enum")) {
          return errorResponse(
            `Database enum error: The payment_status trigger needs to be updated to cast enum values properly. Please run migration 140_fix_payment_status_enum_cast.sql to fix this. Error: ${errorMessage}`,
            "PAYMENT_ENUM_ERROR",
            500,
            errorDetails,
          );
        }

        return errorResponse(errorMessage, "PAYMENT_CREATE_ERROR", 500, errorDetails);
      }

      if (!paymentAlreadyRecorded) {
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
      }

      if (payment.status !== "completed") {
        console.warn(
          `Payment created with status '${payment.status}' instead of 'completed'. Attempting to fix...`,
        );
        const { error: fixError } = await supabaseAdmin
          .from("booking_payments")
          .update({ status: "completed" })
          .eq("id", payment.id);

        if (!fixError) {
          const { data: updatedPayment } = await supabaseAdmin
            .from("booking_payments")
            .select()
            .eq("id", payment.id)
            .single();
          if (updatedPayment) payment = updatedPayment;
        }
      }

      const { data: updatedBooking } = await supabaseAdmin
        .from("bookings")
        .select("total_paid, payment_status")
        .eq("id", bookingId)
        .single();

      if (updatedBooking) {
        console.log(
          `Payment created: ${formatMoney(paymentAmount)}. Booking total_paid: ${formatMoney(updatedBooking.total_paid || 0)}, status: ${updatedBooking.payment_status}`,
        );

        const expectedTotalPaid = (currentTotalPaid || 0) + paymentAmount;
        if (Math.abs((updatedBooking.total_paid || 0) - expectedTotalPaid) > 0.01) {
          console.warn(
            `Payment trigger may not have fired correctly. Expected total_paid: ${formatMoney(expectedTotalPaid)}, Actual: ${formatMoney(updatedBooking.total_paid || 0)}`,
          );
        }
      }

      if (!paymentAlreadyRecorded) {
        try {
          const { syncBookingAfterPaystackSuccess } = await import(
            "@/lib/bookings/sync-booking-after-paystack-success"
          );
          await syncBookingAfterPaystackSuccess(supabaseAdmin, bookingId);
        } catch (syncErr) {
          console.warn("[mark-paid] post-payment booking lifecycle sync failed:", syncErr);
        }

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

          try {
            const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
            const bookingRef =
              booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();
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
              { appType: "customer", skipInApp: true },
            );
          } catch (pushError) {
            console.warn("OneSignal push notification failed:", pushError);
          }

          try {
            const { data: providerRow } = await supabaseAdmin
              .from("providers")
              .select("user_id")
              .eq("id", providerId)
              .maybeSingle();
            const providerUserId = (providerRow as { user_id?: string } | null)?.user_id;
            if (providerUserId) {
              const { data: customerRow } = await supabaseAdmin
                .from("users")
                .select("full_name")
                .eq("id", booking.customer_id)
                .maybeSingle();
              const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
              const bookingRef =
                booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();
              await sendTemplateNotification(
                "provider_payment_received",
                [providerUserId],
                {
                  amount: formatMoney(paymentAmount),
                  booking_number: bookingRef,
                  booking_id: bookingId,
                  customer_name:
                    (customerRow as { full_name?: string } | null)?.full_name ?? "Customer",
                  payment_method: payment_method,
                },
                ["push"],
                { appType: "provider", tenantId: tenantId ?? null, skipInApp: true },
              );
            }
          } catch (providerPushError) {
            console.warn("Provider payment notification failed:", providerPushError);
          }
        } catch (notifError) {
          console.warn("Failed to create payment notification:", notifError);
        }
      }
    }

    let chargesSettled: {
      charge_id: string;
      amount: number;
      description?: string | null;
      reference: string;
    }[] = [];

    if (settleAllCharges && baseFullySettledAfterPayment && unpaidChargeRows.length > 0) {
      try {
        chargesSettled = await settleUnpaidAdditionalChargesForMarkPaid({
          supabaseAdmin,
          bookingId,
          providerId,
          tenantId,
          booking: booking as {
            tenant_id?: string | null;
            customer_id: string;
            booking_number?: string | null;
            ref_number?: string | null;
            currency?: string | null;
          },
          userId: user.id,
          unpaidCharges: unpaidChargeRows,
          effectivePaymentMethod,
          paymentProvider,
          stableReference,
          formatMoney,
          paymentMethodLabel: payment_method,
        });
      } catch (settleErr) {
        const msg =
          settleErr instanceof Error ? settleErr.message : "Failed to settle additional charges";
        return errorResponse(msg, "ADDITIONAL_CHARGE_SETTLEMENT_ERROR", 500, settleErr);
      }
    }

    const message =
      paymentAmount > 0 && chargesSettled.length > 0
        ? "Booking and additional charges marked as paid successfully"
        : chargesSettled.length > 0
          ? "Additional charges marked as paid successfully"
          : paymentAlreadyRecorded
            ? "Payment already recorded"
            : "Booking marked as paid successfully";

    return successResponse({
      payment: payment ?? null,
      base_paid: paymentAmount > 0 ? paymentAmount : 0,
      charges_settled: chargesSettled,
      message,
    });
  } catch (error) {
    return handleApiError(error, "Failed to mark booking as paid");
  }
}
