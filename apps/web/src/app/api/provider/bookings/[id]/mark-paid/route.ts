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
import {
  clearUncollectedProviderPortalPlatformFeeIfNeeded,
  type BookingFeeClearRow,
} from "@/lib/bookings/provider-booking-platform-fee";
import {
  allocateCheckoutGift,
  applyCheckoutBillAdjustment,
  giftRedemptionCreditDecision,
} from "@/lib/bookings/checkout-bill-adjustment";
import {
  buildSyntheticWalletGiftProviderId,
  ensureWalletGiftBookingPayments,
  sumPendingWalletGiftBookingPayments,
} from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { recordCheckoutTipPayment } from "@/lib/bookings/record-checkout-tip-payment";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";

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

    try {
      const { notifyAdditionalChargePaid } = await import(
        "@/lib/notifications/notify-additional-charge-paid"
      );
      await notifyAdditionalChargePaid(supabaseAdmin, charge.id);
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
      checkout_tip,
      checkout_discount,
      gift_card_code,
      gift_card_amount,
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

    const validPaymentMethods = ['cash', 'card', 'bank_transfer', 'other', 'gift_card'];
    const effectivePaymentMethod =
      payment_method === 'mobile' ? 'other' : payment_method === 'split' ? 'cash' : payment_method;
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
      .select("id, status, group_booking_id, tenant_id, total_amount, discount_amount, total_refunded, payment_status, payment_reference, provider_id, customer_id, booking_number, ref_number, total_paid, wallet_amount, gift_card_amount, tip_amount, travel_fee, tax_amount, service_fee_amount, platform_fee_amount, platform_fee_percentage, service_fee_percentage, platform_fee_paid_by, service_fee_paid_by, deposit_amount, booking_source, location_id, location_type, currency, additional_charges(id, amount, status, description, currency)")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const feeClear = await clearUncollectedProviderPortalPlatformFeeIfNeeded(
      supabaseAdmin,
      booking as BookingFeeClearRow,
    );
    if (feeClear.cleared) {
      Object.assign(booking, feeClear.booking);
    }

    const bookingMarketMismatch = bookingTenantMismatchResponse(
      tenantId,
      (booking as { tenant_id?: string | null }).tenant_id,
    );
    if (bookingMarketMismatch) return bookingMarketMismatch;

    const { findOpenTerminalPayments, cancelOpenTerminalPaymentsForEntity } = await import(
      "@/lib/payments/open-terminal-payments"
    );
    // A Yoco finalize records the very charge that may still be pending until the webhook lands.
    const openTerminal = (
      await findOpenTerminalPayments(supabaseAdmin, {
        providerId,
        bookingIds: [bookingId],
        groupBookingId: (booking as { group_booking_id?: string | null }).group_booking_id,
      })
    ).filter((p) => !(payment_provider === "yoco" && p.provider === "yoco"));
    if (openTerminal.length > 0) {
      const cancelOpen =
        body.cancel_open_terminal === true || body.cancel_open_terminal === "true";
      if (!cancelOpen) {
        return errorResponse(
          "A card machine charge is still open for this booking. Cancel it or send cancel_open_terminal.",
          "ENTITY_IN_FLIGHT",
          409,
          { open_terminal_payments: openTerminal },
        );
      }
      const cancelResult = await cancelOpenTerminalPaymentsForEntity(supabaseAdmin, providerId, openTerminal);
      if (cancelResult.errors.length > 0) {
        return errorResponse(
          "Could not cancel the open card machine charge. Check the machine before recording payment.",
          "ENTITY_IN_FLIGHT",
          409,
          { open_terminal_payments: openTerminal, cancel_errors: cancelResult.errors },
        );
      }
    }

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

    const bill = applyCheckoutBillAdjustment({
      totalAmount: Number(booking.total_amount || 0),
      tipAmount: Number((booking as { tip_amount?: number }).tip_amount || 0),
      discountAmount: Number((booking as { discount_amount?: number }).discount_amount || 0),
      checkoutTip: 0,
      checkoutDiscount: Number(checkout_discount || 0),
      revert: body.checkout_revert === true,
    });
    if (
      bill.totalAmount !== Number(booking.total_amount || 0) ||
      bill.tipAmount !== Number((booking as { tip_amount?: number }).tip_amount || 0) ||
      bill.discountAmount !== Number((booking as { discount_amount?: number }).discount_amount || 0)
    ) {
      const { error: billError } = await supabaseAdmin
        .from("bookings")
        .update({
          total_amount: bill.totalAmount,
          tip_amount: bill.tipAmount,
          discount_amount: bill.discountAmount,
        })
        .eq("id", bookingId);
      if (billError) throw billError;
      booking.total_amount = bill.totalAmount;
      (booking as { tip_amount?: number }).tip_amount = bill.tipAmount;
      (booking as { discount_amount?: number }).discount_amount = bill.discountAmount;
    }

    const checkoutTipDue =
      body.checkout_revert === true ? 0 : Math.max(0, Number(checkout_tip) || 0);
    let giftTipPaid = 0;
    const giftCode = typeof gift_card_code === "string" ? gift_card_code.trim().toUpperCase() : "";
    const giftRequested = Math.max(0, Number(gift_card_amount) || 0);
    if (giftCode && giftRequested > 0) {
      const owedBeforeGift = Math.max(
        0,
        Number(booking.total_amount || 0) -
          Math.max(
            Math.max(0, Number(booking.total_paid || 0) - Number((booking as { total_refunded?: number }).total_refunded || 0)),
            Number(booking.wallet_amount || 0) + Number(booking.gift_card_amount || 0),
          ),
      );
      const allocatedGift = allocateCheckoutGift({
        owedBase: owedBeforeGift,
        checkoutTip: checkoutTipDue,
        giftRequested,
      });
      const giftBase = allocatedGift.giftBase;
      const giftApply = Math.round((giftBase + allocatedGift.giftTip) * 100) / 100;
      giftTipPaid = allocatedGift.giftTip;
      if (
        effectivePaymentMethod === "gift_card" &&
        giftRequested + 0.01 < owedBeforeGift + checkoutTipDue
      ) {
        return errorResponse(
          "The gift card does not cover the balance still owed.",
          "GIFT_CARD_SHORT",
          400,
        );
      }
      if (giftApply > 0) {
        const { data: reserved, error: reserveError } = await supabase.rpc("reserve_gift_card_redemption", {
          p_code: giftCode,
          p_amount: giftApply,
          p_booking_id: bookingId,
          p_currency: (booking as { currency?: string }).currency || "ZAR",
        });
        if (reserveError) {
          return errorResponse(
            reserveError.message || "Gift card could not be applied",
            "GIFT_CARD_ERROR",
            400,
          );
        }
        const reservedRow = (Array.isArray(reserved) ? reserved[0] : reserved) as
          | { remaining_balance?: number | null }
          | null
          | undefined;
        const { data: redemptionRow } = await supabaseAdmin
          .from("gift_card_redemptions")
          .select("amount, status")
          .eq("booking_id", bookingId)
          .limit(1)
          .maybeSingle();
        const { data: recordedGiftRows } = await supabaseAdmin
          .from("booking_payments")
          .select("amount")
          .eq("booking_id", bookingId)
          .eq("payment_provider", "gift_card")
          .in("status", ["pending", "completed", "partially_refunded"]);
        const recordedGiftPayments = (recordedGiftRows ?? []).reduce(
          (sum, row) => sum + Number((row as { amount?: number }).amount || 0),
          0,
        );
        const giftLegId = buildSyntheticWalletGiftProviderId(
          "gift_card",
          bookingId,
          `:checkout:${giftCode}`,
        );
        const { data: existingGiftPay } = await supabaseAdmin
          .from("booking_payments")
          .select("id, amount")
          .eq("payment_provider_id", giftLegId)
          .maybeSingle();
        const giftDecision = giftRedemptionCreditDecision({
          remainingBalance:
            reservedRow?.remaining_balance == null ? null : Number(reservedRow.remaining_balance),
          redemptionAmount:
            redemptionRow == null ? null : Number((redemptionRow as { amount?: number }).amount),
          redemptionStatus:
            redemptionRow == null ? null : String((redemptionRow as { status?: string }).status ?? ""),
          giftApply,
          existingCheckoutPayment: Boolean(existingGiftPay),
          recordedGiftPayments,
        });
        if (
          existingGiftPay &&
          Math.abs(Number((existingGiftPay as { amount?: number }).amount || 0) - giftBase) > 0.02
        ) {
          return errorResponse(
            "This gift card was already applied for a different amount.",
            "GIFT_CARD_ALREADY_APPLIED",
            400,
          );
        }
        if (giftDecision === "reject") {
          return errorResponse(
            "This booking already has a gift card redemption. A second gift card cannot be applied to the same booking.",
            "GIFT_CARD_ALREADY_APPLIED",
            400,
          );
        }
        const { data: captured, error: captureError } = await supabaseAdmin.rpc(
          "capture_gift_card_redemption",
          { p_booking_id: bookingId },
        );
        if (captureError || captured === false) {
          await supabaseAdmin.rpc("void_gift_card_redemption", { p_booking_id: bookingId });
          return errorResponse(
            captureError?.message || "Gift card capture failed",
            "GIFT_CARD_ERROR",
            500,
          );
        }
        if (!existingGiftPay && giftBase > 0 && giftDecision === "credit") {
          const previousGift = Number(booking.gift_card_amount || 0);
          const nextGift = Math.round((previousGift + giftBase) * 100) / 100;
          const { error: giftUpdateError } = await supabaseAdmin
            .from("bookings")
            .update({ gift_card_amount: nextGift })
            .eq("id", bookingId);
          if (giftUpdateError) throw giftUpdateError;
          booking.gift_card_amount = nextGift;
          booking.total_paid = Number(booking.total_paid || 0) + giftBase;
          await ensureWalletGiftBookingPayments(supabaseAdmin, {
            bookingId,
            tenantId: (booking as { tenant_id?: string | null }).tenant_id,
            walletAmount: 0,
            giftCardAmount: giftBase,
            initialStatus: "completed",
            paymentLegSuffix: `:checkout:${giftCode}`,
          });
          const { data: recordedGiftPay } = await supabaseAdmin
            .from("booking_payments")
            .select("id")
            .eq("payment_provider_id", giftLegId)
            .maybeSingle();
          if (!recordedGiftPay) {
            await supabaseAdmin
              .from("bookings")
              .update({ gift_card_amount: previousGift })
              .eq("id", bookingId);
            booking.gift_card_amount = previousGift;
            booking.total_paid = Number(booking.total_paid || 0) - giftBase;
            throw new Error("Gift card payment was not recorded");
          }
        }
        await syncBookingAfterPaystackSuccess(supabaseAdmin, bookingId, {
          paymentProvider: "gift_card",
        });
        if (giftTipPaid > 0) {
          await recordCheckoutTipPayment(supabaseAdmin, {
            bookingId,
            tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
            tip: giftTipPaid,
            paymentMethod: "gift_card",
            paymentProvider: "gift_card",
            processedBy: user.id,
            providerPaymentId: `checkout-tip:${bookingId}:gift`,
          });
          const withGiftTip = Math.round((Number(booking.gift_card_amount || 0) + giftTipPaid) * 100) / 100;
          await supabaseAdmin.from("bookings").update({ gift_card_amount: withGiftTip }).eq("id", bookingId);
          booking.gift_card_amount = withGiftTip;
        }
      }
    }

    const bookingTenantId = (booking as { tenant_id?: string | null }).tenant_id ?? null;
    const recordTillTip = async () => {
      const remainder = Math.round((checkoutTipDue - giftTipPaid) * 100) / 100;
      if (remainder > 0) {
        const tipProvider =
          effectivePaymentMethod === "cash"
            ? "cash"
            : effectivePaymentMethod === "gift_card"
              ? "gift_card"
              : payment_provider === "yoco"
                ? "yoco"
                : "other";
        await recordCheckoutTipPayment(supabaseAdmin, {
          bookingId,
          tenantId: bookingTenantId,
          tip: remainder,
          paymentMethod: effectivePaymentMethod,
          paymentProvider: tipProvider,
          processedBy: user.id,
          providerPaymentId: `checkout-tip:${bookingId}`,
        });
      }
    };

    if (body.bill_only === true) {
      return successResponse({
        total_amount: Number(booking.total_amount || 0),
        adjusted: true,
      });
    }

    if (body.gift_only === true) {
      if (!giftCode || giftRequested <= 0) {
        return errorResponse(
          "A gift card amount is required before the card machine charge.",
          "GIFT_CARD_REQUIRED",
          400,
        );
      }
      return successResponse({
        total_amount: Number(booking.total_amount || 0),
        gift_applied: true,
      });
    }

    const currentTotalPaid = booking.total_paid || 0;
    const totalRefunded = Number((booking as any).total_refunded || 0);
    const walletAlreadyApplied = Number((booking as any).wallet_amount || 0);
    const giftCardAlreadyApplied = Number((booking as any).gift_card_amount || 0);
    const bookingTotal = booking.total_amount || 0;
    const pendingWalletGift = await sumPendingWalletGiftBookingPayments(supabaseAdmin, bookingId);
    const remainingBalance = computeBookingOutstandingDisplay({
      totalAmount: bookingTotal,
      totalPaid: currentTotalPaid,
      totalRefunded,
      walletAmount: walletAlreadyApplied,
      giftCardAmount: giftCardAlreadyApplied,
      unpaidAdditionalCharges: 0,
      paymentStatus: (booking as { payment_status?: string | null }).payment_status,
      pendingWalletGiftAmount: pendingWalletGift,
    });
    if (effectivePaymentMethod === "gift_card" && remainingBalance > 0.01) {
      return errorResponse(
        "The gift card does not cover the balance still owed.",
        "GIFT_CARD_SHORT",
        400,
      );
    }
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
        await recordTillTip();
        return successResponse({
          payment: null,
          base_paid: 0,
          charges_settled: [],
          message: "Booking is already fully paid (including wallet/gift card credits)",
          already_paid: true,
        });
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
    let baseAlreadyFullyPaidRace = false;

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

      if (!payment && !paymentError) {
        const bookingTenantId = (booking as { tenant_id?: string | null }).tenant_id;
        const paymentProviderData = stableReference
          ? {
              source:
                paymentProvider === "yoco"
                  ? "provider_mark_paid_yoco_terminal"
                  : "provider_mark_paid",
              reference: stableReference,
              idempotency_key:
                typeof idempotency_key === "string" && idempotency_key.trim()
                  ? idempotency_key.trim()
                  : request.headers.get("Idempotency-Key")?.trim() || null,
            }
          : null;

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
            p_reference: stableReference,
            p_payment_provider_data: paymentProviderData,
            p_tenant_id: bookingTenantId ?? null,
          },
        );

        if (!rpcError && rpcPayment) {
          payment = Array.isArray(rpcPayment) ? rpcPayment[0] : rpcPayment;
        } else {
          paymentError = rpcError;
        }
      }

      if (paymentError || !payment) {
        console.error("Error creating payment record:", paymentError);
        const errorMessage = paymentError?.message || "Failed to create payment record";
        const errorDetails = paymentError?.details || paymentError;

        if (errorMessage.includes("INVALID_BOOKING_STATUS")) {
          return errorResponse(
            "Cannot record payment for a cancelled or no-show booking",
            "INVALID_STATUS",
            400,
            errorDetails,
          );
        }

        if (errorMessage.includes("INVALID_AMOUNT")) {
          return errorResponse("Invalid payment amount", "VALIDATION_ERROR", 400, errorDetails);
        }

        if (errorMessage.includes("NOTHING_OWING")) {
          paymentAmount = 0;
          payment = null;
          paymentError = null;
          paymentAlreadyRecorded = true;
          baseAlreadyFullyPaidRace = true;
          if (!(settleAllCharges && unpaidChargeRows.length > 0)) {
            await recordTillTip();
            return successResponse({
              message: "Booking is already fully paid (including wallet/gift card credits)",
              already_paid: true,
            });
          }
        } else {
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

      if (payment && payment.status !== "completed") {
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

      const { data: updatedBooking } = payment
        ? await supabaseAdmin
            .from("bookings")
            .select("total_paid, payment_status")
            .eq("id", bookingId)
            .single()
        : { data: null };

      if (payment && updatedBooking) {
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

      if (payment && !paymentAlreadyRecorded) {
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

    const canSettleAdditionalCharges =
      baseFullySettledAfterPayment || baseAlreadyFullyPaidRace;

    if (settleAllCharges && canSettleAdditionalCharges && unpaidChargeRows.length > 0) {
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

    if (baseFullySettledAfterPayment || baseAlreadyFullyPaidRace) {
      await recordTillTip();
      if (Number(booking.gift_card_amount || 0) > 0.009) {
        const { data: captured, error: giftCaptureErr } = await (supabaseAdmin.rpc as any)(
          "capture_gift_card_redemption",
          { p_booking_id: bookingId },
        );
        if (giftCaptureErr || captured === false || captured === null) {
          const captureMessage = String(giftCaptureErr?.message || "");
          const balanceRestored =
            /expired|no longer active/i.test(captureMessage) ||
            captured === false ||
            captured === null;
          console.error("[mark-paid] gift card capture failed after the booking was paid", {
            bookingId,
            giftCaptureErr,
          });
          if (balanceRestored) {
            await supabaseAdmin
              .from("booking_payments")
              .delete()
              .eq("booking_id", bookingId)
              .eq("payment_provider", "gift_card")
              .eq("status", "pending");
            await supabaseAdmin
              .from("bookings")
              .update({
                gift_card_amount: 0,
                gift_card_id: null,
                payment_status: "partially_paid",
              })
              .eq("id", bookingId);
          }
        }
      }
    }

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
