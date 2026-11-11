import { addMoney } from "@beautonomi/utils";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { requireManualCardEnabledForProvider } from "@/lib/payments/require-manual-card-enabled";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { notifyAdditionalChargePaid } from "@/lib/notifications/notify-additional-charge-paid";
import { additionalChargeAmountStillDue } from "@/lib/bookings/display-invariants";
import { sumAdditionalChargeTenderLegs } from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import {
  settleAdditionalChargeRemainderAfterHold,
  settleAdditionalChargeWithoutPaystack,
} from "@/lib/bookings/settle-additional-charge-without-paystack";
import { rollbackCollectibleSplitLeg } from "@/lib/bookings/rollback-collectible-split-leg";
import { assertYocoMarkPaidReference } from "@/lib/payments/assert-yoco-mark-paid-reference";

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
        "Paystack Terminal additional-charge payments must be verified by Paystack and allocated from the terminal payment inbox.",
        "PAYSTACK_TERMINAL_ALLOCATION_REQUIRED",
        400,
      );
    }

    const manualCardGate = await requireManualCardEnabledForProvider(supabase, providerId, {
      payment_method,
      payment_provider,
    });
    if (manualCardGate) return manualCardGate;

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
      .select("id, provider_id, tenant_id, customer_id, booking_number, ref_number, currency, total_amount, total_paid, location_id")
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

    const chargeStatus = String(charge.status || "").toLowerCase();
    if (chargeStatus === "paid") {
      return errorResponse("This charge has already been paid", "ALREADY_PAID", 400);
    }
    if (chargeStatus === "rejected") {
      return errorResponse("This charge has been rejected", "CHARGE_REJECTED", 400);
    }

    const chargeAmount = Number(charge.amount);
    const currency = charge.currency || booking.currency || lastResortCurrency;

    let paymentProvider = 'other';
    if (effectiveMethod === 'cash') {
      paymentProvider = 'cash';
    } else if (effectiveMethod === 'card') {
      paymentProvider = payment_provider === "yoco" || (typeof reference === "string" && reference.trim()) ? "yoco" : "other";
    }

    const stableReference =
      typeof reference === "string" && reference.trim()
        ? reference.trim()
        : typeof idempotency_key === "string" && idempotency_key.trim()
          ? idempotency_key.trim()
          : request.headers.get("Idempotency-Key")?.trim() || `additional_charge_${chargeId}_${effectiveMethod}`;
    if (paymentProvider === "yoco" && !(typeof reference === "string" && reference.trim())) {
      return errorResponse(
        "Yoco additional-charge payments require the terminal payment reference.",
        "YOCO_REFERENCE_REQUIRED",
        400
      );
    }

    const held = await sumAdditionalChargeTenderLegs(supabaseAdmin, bookingId, chargeId);
    const heldTotal = addMoney(held.wallet, held.gift);
    const stillDue = additionalChargeAmountStillDue(chargeAmount, heldTotal);
    if (paymentProvider === "yoco" && stillDue > 0.009) {
      const yocoCheck = await assertYocoMarkPaidReference(supabaseAdmin, {
        providerId,
        reference: String(reference).trim(),
        expectedEntityType: "additional_charge",
        expectedEntityId: chargeId,
        expectedAppointmentId: bookingId,
        expectedAmountMajor: stillDue,
        currency,
      });
      if (yocoCheck.ok === false) {
        return errorResponse(yocoCheck.message, yocoCheck.code, 400);
      }
    }
    if (heldTotal > 0.009) {
      if (stillDue <= 0.009) {
        const covered = await settleAdditionalChargeWithoutPaystack(supabaseAdmin, {
          bookingId,
          chargeId,
          customerId: String((booking as { customer_id?: string }).customer_id ?? user.id),
          providerId,
          tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? tenantId,
          bookingNumber: String(
            (booking as { booking_number?: string | null }).booking_number ??
              (booking as { ref_number?: string | null }).ref_number ??
              bookingId.slice(0, 8),
          ),
          chargeAmount,
          walletAmountApplied: held.wallet,
          giftCardAmountApplied: held.gift,
        });
        if (covered.ok === false) {
          await rollbackCollectibleSplitLeg(supabaseAdmin, {
            bookingId,
            customerId: String((booking as { customer_id?: string }).customer_id ?? user.id),
            currency: String((booking as { currency?: string | null }).currency ?? LAST_RESORT_CURRENCY),
            tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? tenantId,
            providerId,
            walletAmountToReverse: held.wallet,
            giftCardAmountToReverse: held.gift,
            paymentLegSuffix: `:additional:${chargeId}`,
            idempotencyKey: `additional_charge_mark_paid_rollback:${chargeId}`,
          });
          return errorResponse(covered.error, "ADDITIONAL_CHARGE_SETTLEMENT_ERROR", 500);
        }
        return successResponse({
          payment: { provider: paymentProvider, reference: stableReference },
          charge: { ...charge, status: "paid", paid_at: new Date().toISOString() },
          message: "Additional charge marked as paid successfully",
        });
      } else {
        const remainder = await settleAdditionalChargeRemainderAfterHold(supabaseAdmin, {
          bookingId,
          chargeId,
          providerId,
          tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? tenantId,
          chargeAmount,
          chargeDescription: (charge as { description?: string | null }).description ?? null,
          heldWallet: held.wallet,
          heldGift: held.gift,
          remainderAmount: stillDue,
          paymentProvider,
          paymentMethod: effectiveMethod,
          reference: stableReference,
          createdBy: user.id,
        });
        if (remainder.ok === false) {
          return errorResponse(remainder.error, "ADDITIONAL_CHARGE_SETTLEMENT_ERROR", 500);
        }
      }
    } else {
    const { error: settlementError } = await supabaseAdmin.rpc(
      "record_walk_in_additional_charge_payment",
      {
        p_booking_id: bookingId,
        p_charge_id: chargeId,
        p_provider_id: providerId,
        p_tenant_id: (booking as { tenant_id?: string | null }).tenant_id ?? tenantId,
        p_payment_provider: paymentProvider,
        p_payment_method: effectiveMethod,
        p_reference: stableReference,
        p_created_by: user.id,
      }
    );

    if (settlementError) {
      return errorResponse(
        settlementError.message || "Failed to settle additional charge payment",
        "ADDITIONAL_CHARGE_SETTLEMENT_ERROR",
        500,
        settlementError
      );
    }
    }

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
          payment_reference: stableReference,
        },
        created_by: user.id,
      });

    try {
      await notifyAdditionalChargePaid(supabaseAdmin, chargeId);
    } catch (notifError) {
      console.warn("Failed to create payment notification:", notifError);
    }

    return successResponse({
      payment: {
        provider: paymentProvider,
        reference: stableReference,
      },
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
