import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { resolvePaymentTenantForBookingRequest } from "@/lib/bookings/resolve-payment-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { applyCollectibleGiftAndWallet } from "@/lib/bookings/apply-collectible-gift-wallet";
import { settleAdditionalChargeWithoutPaystack } from "@/lib/bookings/settle-additional-charge-without-paystack";
import { rollbackCollectibleSplitLeg } from "@/lib/bookings/rollback-collectible-split-leg";
import { z } from "zod";

const payChargeBodySchema = z.object({
  use_wallet: z.boolean().optional(),
  gift_card_code: z.string().optional(),
  callback_url: z.string().optional(),
});

/**
 * POST /api/me/bookings/[id]/additional-charges/[chargeId]/pay
 *
 * Settle an additional charge with optional gift card + wallet split, then Paystack for remainder.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["customer"], request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const { id: bookingId, chargeId } = await params;
    const rawBody = await request.json().catch(() => ({}));
    const parsedBody = payChargeBodySchema.safeParse(rawBody);
    const body = parsedBody.success ? parsedBody.data : {};
    const useWallet = body.use_wallet === true;
    const giftCardCode =
      typeof body.gift_card_code === "string" ? body.gift_card_code.trim() : "";

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, customer_id, provider_id, currency, booking_number, ref_number, tenant_id")
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
    if (!["pending", "approved"].includes(chargeStatus)) {
      return errorResponse("This charge cannot be paid in its current status", "INVALID_STATUS", 400);
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

    const chargeAmount = Number(charge.amount);
    const currency = charge.currency || booking.currency || lastResortCurrency;
    const bookingNumber =
      booking.booking_number || booking.ref_number || bookingId.slice(0, 8).toUpperCase();

    let walletAmountApplied = 0;
    let giftCardAmountApplied = 0;
    let paystackAmount = chargeAmount;

    const reference = generateTransactionReference("charge", chargeId);
    const paymentLegSuffix = `:additional:${chargeId}`;

    if (useWallet || giftCardCode) {
      const applied = await applyCollectibleGiftAndWallet({
        supabase,
        admin,
        customerId: user.id,
        bookingId,
        bookingNumber,
        providerId: (booking as { provider_id: string }).provider_id,
        tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
        currency,
        collectibleAmount: chargeAmount,
        useWallet,
        giftCardCode: giftCardCode || null,
        walletDescription: `Wallet spend (additional charge) for booking ${bookingNumber}`,
        paymentLegSuffix,
        deferFullSettlement: true,
      });
      if (applied.ok === false) {
        return errorResponse(applied.error, applied.code ?? "SPLIT_ERROR", 400);
      }
      walletAmountApplied = applied.walletAmountApplied;
      giftCardAmountApplied = applied.giftCardAmountApplied;
      paystackAmount = applied.paystackAmount;

      if (applied.fullySettled) {
        const settled = await settleAdditionalChargeWithoutPaystack(admin, {
          bookingId,
          chargeId,
          customerId: user.id,
          providerId: (booking as { provider_id: string }).provider_id,
          tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
          bookingNumber,
          chargeAmount,
          walletAmountApplied,
          giftCardAmountApplied,
        });
        if (settled.ok === false) {
          return errorResponse(settled.error, "SETTLEMENT_ERROR", 500);
        }
        return successResponse({
          authorization_url: "",
          access_code: "",
          reference: null,
          wallet_amount_applied: walletAmountApplied,
          gift_card_amount_applied: giftCardAmountApplied,
          paystack_amount: 0,
          fully_settled: true,
        });
      }
    }

    const chargeAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com";
    const callbackFromClient =
      typeof body.callback_url === "string" ? body.callback_url.trim() : "";
    const chargeCallbackUrl =
      callbackFromClient && (callbackFromClient.startsWith("customer://") || callbackFromClient.startsWith("exp://"))
        ? `${callbackFromClient}${callbackFromClient.includes("?") ? "&" : "?"}charge_id=${encodeURIComponent(chargeId)}`
        : `${chargeAppUrl}/account-settings/bookings/${bookingId}/payment-callback?charge_id=${encodeURIComponent(chargeId)}`;
    const chargeCancelAction =
      callbackFromClient && (callbackFromClient.startsWith("customer://") || callbackFromClient.startsWith("exp://"))
        ? `${callbackFromClient}${callbackFromClient.includes("?") ? "&" : "?"}charge_cancelled=1&charge_id=${encodeURIComponent(chargeId)}`
        : `${chargeAppUrl}/account-settings/bookings/${bookingId}?charge_cancelled=1&charge_id=${encodeURIComponent(chargeId)}`;

    let paystackResponse: Awaited<ReturnType<typeof initializePaystackTransaction>>;
    try {
      paystackResponse = await initializePaystackTransaction({
        email: customer.email,
        amountInSmallestUnit: convertToSmallestUnit(paystackAmount),
        currency,
        reference,
        metadata: {
          booking_id: bookingId,
          booking_number: bookingNumber,
          charge_id: chargeId,
          additional_charge_id: chargeId,
          charge_description: charge.description,
          customer_id: user.id,
          payment_type: "additional_charge",
          cancel_action: chargeCancelAction,
          wallet_amount_applied: walletAmountApplied,
          gift_card_amount_applied: giftCardAmountApplied,
        },
        callback_url: chargeCallbackUrl,
        tenantId: paymentTenantId,
      });
    } catch (initErr) {
      if (walletAmountApplied > 0 || giftCardAmountApplied > 0) {
        await rollbackCollectibleSplitLeg(admin, {
          bookingId,
          customerId: user.id,
          currency,
          tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
          providerId: (booking as { provider_id: string }).provider_id,
          walletAmountToReverse: walletAmountApplied,
          giftCardAmountToReverse: giftCardAmountApplied,
          paymentLegSuffix,
          idempotencyKey: `additional_charge_rollback:${chargeId}`,
        });
      }
      throw initErr;
    }

    if (!paystackResponse.data?.authorization_url) {
      if (walletAmountApplied > 0 || giftCardAmountApplied > 0) {
        await rollbackCollectibleSplitLeg(admin, {
          bookingId,
          customerId: user.id,
          currency,
          tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
          providerId: (booking as { provider_id: string }).provider_id,
          walletAmountToReverse: walletAmountApplied,
          giftCardAmountToReverse: giftCardAmountApplied,
          paymentLegSuffix,
          idempotencyKey: `additional_charge_rollback:${chargeId}`,
        });
      }
      throw new Error("Failed to generate payment link");
    }

    if (chargeStatus === "pending") {
      await supabase
        .from("additional_charges")
        .update({ status: "approved" })
        .eq("id", chargeId);
    }

    await admin.from("booking_events").insert({
      booking_id: bookingId,
      event_type: "additional_payment_initiated",
      event_data: {
        charge_id: chargeId,
        description: charge.description,
        amount: chargeAmount,
        paystack_amount: paystackAmount,
        wallet_amount_applied: walletAmountApplied,
        gift_card_amount_applied: giftCardAmountApplied,
        reference,
      },
      created_by: user.id,
    });

    return successResponse({
      authorization_url: paystackResponse.data?.authorization_url ?? "",
      access_code: paystackResponse.data?.access_code ?? "",
      reference,
      wallet_amount_applied: walletAmountApplied,
      gift_card_amount_applied: giftCardAmountApplied,
      paystack_amount: paystackAmount,
      fully_settled: false,
    });
  } catch (error) {
    return handleApiError(error, "Failed to initiate payment");
  }
}
