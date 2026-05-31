import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { recordBookingPaystackPayment } from "@/lib/bookings/record-booking-paystack-payment";
import { chargeAuthorization, convertToSmallestUnit } from "@/lib/payments/paystack-complete";
import { convertFromSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import {
  resolveBookingPaystackAmount,
  resolveProductOrderPaystackAmount,
} from "@/lib/payments/resolve-paystack-initialize-amount";
import { revalidateBookingSlotBeforePayment } from "@/lib/bookings/revalidate-booking-slot-before-payment";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import { applyWalletTopupFromSuccessfulPaystackCharge } from "@/lib/wallet/apply-wallet-topup-from-paystack-success";
import { z } from "zod";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { isPaymentMethodExpired } from "@/lib/payments/payment-method-expiry";

const chargeSavedCardSchema = z
  .object({
    payment_method_id: z.string().uuid(),
    /** Ignored when metadata includes product_order_id or booking id — server derives amount. */
    amount: z.number().positive().optional(),
    currency: z.string().optional(),
    email: z.string().email(),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  .superRefine((val, ctx) => {
    const m = val.metadata || {};
    const hasProductOrder =
      typeof m.product_order_id === "string" && String(m.product_order_id).trim().length > 0;
    const hasBooking =
      (typeof m.booking_id === "string" && String(m.booking_id).trim().length > 0) ||
      (typeof m.bookingId === "string" && String(m.bookingId).trim().length > 0);
    const hasGiftCardOrder =
      typeof m.gift_card_order_id === "string" && String(m.gift_card_order_id).trim().length > 0;
    if (
      !hasProductOrder &&
      !hasBooking &&
      !hasGiftCardOrder &&
      (val.amount == null || val.amount <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "amount is required unless charging for a product order, booking, or gift card order",
        path: ["amount"],
      });
    }
  });

/**
 * POST /api/payments/charge-saved-card
 *
 * Charge a saved Paystack card using authorization code
 */
export async function POST(request: NextRequest) {
  try {
    // §Customer-launch (audit 2026-04): previously both requireRoleInApi
    // and getSupabaseServer were called without `request`, so the Bearer
    // header that mobile clients send was ignored. That made the saved-
    // card charge path reject authenticated mobile users with the
    // generic 401/403 auth error seen on the customer payment flow.
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const body = chargeSavedCardSchema.parse(await request.json());
    const currency = body.currency ?? lastResortCurrency;

    const supabase = await getSupabaseServer(request);

    // Get the payment method
    const { data: paymentMethod, error: pmError } = await (supabase.from("payment_methods") as any)
      .select("*")
      .eq("id", body.payment_method_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("provider", "paystack")
      .single();

    if (pmError || !paymentMethod) {
      return handleApiError(
        new Error("Payment method not found or invalid"),
        "Payment method not found",
        "NOT_FOUND",
        404
      );
    }

    // Verify the payment method belongs to the user
    if (paymentMethod.user_id !== user.id) {
      return handleApiError(
        new Error("Unauthorized"),
        "You don't have permission to use this payment method",
        "UNAUTHORIZED",
        403
      );
    }

    // Get authorization code
    const authorizationCode = paymentMethod.provider_payment_method_id;

    if (!authorizationCode || !authorizationCode.startsWith("AUTH_")) {
      return handleApiError(
        new Error("Invalid payment method"),
        "This payment method is not a valid Paystack authorization",
        "INVALID_METHOD",
        400
      );
    }

    if (isPaymentMethodExpired(paymentMethod.expiry_month, paymentMethod.expiry_year)) {
      return errorResponse(
        "This saved card has expired. Please remove it and pay with a new card.",
        "CARD_EXPIRED",
        400
      );
    }

    const meta = body.metadata ?? {};
    const productOrderIdFromMeta =
      typeof meta.product_order_id === "string" && meta.product_order_id.trim()
        ? meta.product_order_id.trim()
        : null;
    const giftCardOrderIdFromMeta =
      typeof meta.gift_card_order_id === "string" && meta.gift_card_order_id.trim()
        ? meta.gift_card_order_id.trim()
        : null;
    const walletTopupIdFromMeta =
      typeof meta.wallet_topup_id === "string" && meta.wallet_topup_id.trim()
        ? meta.wallet_topup_id.trim()
        : null;

    if (productOrderIdFromMeta) {
      const { data: poRow, error: poErr } = await (supabase.from("product_orders") as any)
        .select("id, tenant_id, customer_id")
        .eq("id", productOrderIdFromMeta)
        .maybeSingle();
      if (poErr || !poRow) {
        return notFoundResponse("Order not found");
      }
      if (!resourceTenantMatchesHostTenant(tenantId, poRow.tenant_id)) {
        return errorResponse(
          "This order belongs to a different market. Open checkout from the correct site or app for this order.",
          "TENANT_MISMATCH",
          403
        );
      }
      if (poRow.customer_id !== user.id) {
        return errorResponse("You do not have permission to charge this order", "FORBIDDEN", 403);
      }
    }

    const bookingIdFromMeta =
      (typeof meta.booking_id === "string" && meta.booking_id) ||
      (typeof meta.bookingId === "string" && meta.bookingId) ||
      null;
    let bookingTenantId: string | null = null;

    if (giftCardOrderIdFromMeta && !productOrderIdFromMeta) {
      const { data: gcoRow, error: gcoErr } = await (supabase.from("gift_card_orders") as any)
        .select("id, tenant_id, purchaser_user_id, status, total_amount, currency")
        .eq("id", giftCardOrderIdFromMeta)
        .maybeSingle();
      if (gcoErr || !gcoRow) {
        return notFoundResponse("Gift card order not found");
      }
      if (
        !resourceTenantMatchesHostTenant(
          tenantId,
          (gcoRow as { tenant_id?: string | null }).tenant_id
        )
      ) {
        return errorResponse(
          "This purchase belongs to a different market.",
          "TENANT_MISMATCH",
          403
        );
      }
      if ((gcoRow as { purchaser_user_id?: string }).purchaser_user_id !== user.id) {
        return errorResponse("You do not have permission to pay for this order", "FORBIDDEN", 403);
      }
      const gcoStatus = String((gcoRow as { status?: string }).status ?? "").toLowerCase();
      if (gcoStatus !== "pending") {
        return errorResponse("This gift card order is no longer awaiting payment", "CONFLICT", 409);
      }
    }

    if (bookingIdFromMeta && !productOrderIdFromMeta) {
      const { data: bookingRow, error: bookingErr } = await supabase
        .from("bookings")
        .select("id, tenant_id, customer_id")
        .eq("id", bookingIdFromMeta)
        .maybeSingle();
      if (bookingErr || !bookingRow) {
        return notFoundResponse("Booking not found");
      }
      if (!resourceTenantMatchesHostTenant(tenantId, bookingRow.tenant_id)) {
        return errorResponse(
          "This booking belongs to a different market. Open checkout from the correct site or app for this booking.",
          "TENANT_MISMATCH",
          403
        );
      }
      if (bookingRow.customer_id !== user.id) {
        return errorResponse("You do not have permission to charge this booking", "FORBIDDEN", 403);
      }
      bookingTenantId = bookingRow.tenant_id ?? null;
    }

    let amountInSmallestUnit: number;
    if (productOrderIdFromMeta) {
      const resolved = await resolveProductOrderPaystackAmount(
        supabase,
        productOrderIdFromMeta,
        user.id
      );
      if (resolved.ok === false) {
        return errorResponse(resolved.message, resolved.code, resolved.status);
      }
      amountInSmallestUnit = resolved.amountSmallestUnit;
    } else if (giftCardOrderIdFromMeta && !productOrderIdFromMeta) {
      const { data: gcoAmount } = await (supabase.from("gift_card_orders") as any)
        .select("total_amount")
        .eq("id", giftCardOrderIdFromMeta)
        .maybeSingle();
      const total = Number((gcoAmount as { total_amount?: number } | null)?.total_amount ?? 0);
      if (!Number.isFinite(total) || total <= 0) {
        return errorResponse("Invalid gift card order amount", "INVALID_ORDER", 400);
      }
      amountInSmallestUnit = convertToSmallestUnit(total);
    } else if (bookingIdFromMeta) {
      const resolved = await resolveBookingPaystackAmount(supabase, bookingIdFromMeta, user.id);
      if (resolved.ok === false) {
        return errorResponse(resolved.message, resolved.code, resolved.status);
      }
      const admin = getSupabaseAdmin();
      const slotOk = await revalidateBookingSlotBeforePayment(admin, bookingIdFromMeta);
      if (slotOk.ok === false) {
        return errorResponse(slotOk.message, slotOk.code, 409);
      }
      amountInSmallestUnit = resolved.amountSmallestUnit;
    } else {
      amountInSmallestUnit = convertToSmallestUnit(body.amount!);
    }

    const chargeReference = generateTransactionReference(
      productOrderIdFromMeta
        ? "order"
        : bookingIdFromMeta
          ? "booking"
          : giftCardOrderIdFromMeta
            ? "giftcard"
            : "savedcard",
      productOrderIdFromMeta ?? bookingIdFromMeta ?? giftCardOrderIdFromMeta ?? user.id
    );

    const chargeResult = await chargeAuthorization(
      authorizationCode,
      body.email,
      amountInSmallestUnit,
      {
        ...body.metadata,
        payment_method_id: body.payment_method_id,
        user_id: user.id,
      },
      { tenantId, reference: chargeReference }
    );

    if (!chargeResult.status) {
      return handleApiError(
        new Error(chargeResult.message || "Charge failed"),
        "Failed to charge card",
        "CHARGE_FAILED",
        400
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    if (productOrderIdFromMeta && chargeResult.data?.reference) {
      try {
        await recordProductOrderPayment({
          supabase: supabaseAdmin,
          productOrderId: productOrderIdFromMeta,
          reference: String(chargeResult.data.reference),
          amountMajor: convertFromSmallestUnit(amountInSmallestUnit),
          feesMajor: 0,
          source: "paystack_verify",
          provider: "paystack",
        });
      } catch (poErr) {
        console.error("[charge-saved-card] Failed to record product order payment:", poErr);
      }
    }

    // Sync the booking's payment status/totals when a booking_id is present.
    // Record the canonical booking_payments row first so DB triggers have
    // payment truth before lifecycle sync runs.
    if (bookingIdFromMeta) {
      const chargeData = chargeResult.data as {
        id?: number;
        reference?: string;
        amount?: number;
        status?: string;
      };
      const amountMajor =
        typeof chargeData.amount === "number"
          ? convertFromSmallestUnit(chargeData.amount)
          : convertFromSmallestUnit(amountInSmallestUnit);
      const recordedPayment = await recordBookingPaystackPayment(supabaseAdmin, {
        bookingId: bookingIdFromMeta,
        tenantId: bookingTenantId,
        reference: chargeData.reference ?? chargeReference,
        transactionId: chargeData.id ?? null,
        amountMajor,
        source: "charge_saved_card",
        paymentOption: typeof meta.payment_option === "string" ? meta.payment_option : null,
        requiresDeposit: Boolean(meta.requires_deposit),
        saveCard: Boolean(meta.save_card),
        paymentMethodId: body.payment_method_id,
        notes: `Saved card charge. Ref: ${chargeData.reference ?? chargeReference}`,
      });
      if (recordedPayment.ok === false) {
        console.error(
          "[charge-saved-card] Failed to record booking payment after successful charge:",
          recordedPayment
        );
      }
      try {
        await syncBookingAfterPaystackSuccess(supabaseAdmin, bookingIdFromMeta, {
          paymentReference: chargeData.reference ?? chargeReference,
          paymentProvider: "paystack",
        });
      } catch (syncErr) {
        console.error("[charge-saved-card] Failed to sync booking after charge:", syncErr);
      }
    }

    // Wallet top-up via saved card: credit the wallet immediately on a successful
    // charge so the customer sees their balance update right away, instead of
    // waiting on the async webhook (the charge reference differs from the
    // wallet_topup_* reference set at initialize, so webhook-only crediting was
    // fragile). applyWalletTopup is idempotent, so verify/webhook can run later
    // without double-crediting.
    if (
      walletTopupIdFromMeta &&
      !productOrderIdFromMeta &&
      !bookingIdFromMeta &&
      !giftCardOrderIdFromMeta &&
      String(chargeResult.data?.status ?? "") === "success"
    ) {
      const { data: wtRow } = await (supabaseAdmin.from("wallet_topups") as any)
        .select("id, user_id")
        .eq("id", walletTopupIdFromMeta)
        .maybeSingle();
      if (wtRow && (wtRow as { user_id?: string }).user_id === user.id) {
        try {
          const chargeData = chargeResult.data as { reference?: string; amount?: number };
          await applyWalletTopupFromSuccessfulPaystackCharge(
            {
              reference: String(chargeData.reference ?? chargeReference),
              metadata: { ...meta, wallet_topup_id: walletTopupIdFromMeta, user_id: user.id },
              amount:
                typeof chargeData.amount === "number" ? chargeData.amount : amountInSmallestUnit,
            },
            supabaseAdmin,
          );
        } catch (walletErr) {
          console.error("[charge-saved-card] Failed to credit wallet top-up after charge:", walletErr);
        }
      }
    }

    return successResponse({
      transaction: chargeResult.data,
      reference: chargeResult.data.reference ?? chargeReference,
      status: chargeResult.data.status,
      message: chargeResult.message,
      currency,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to charge saved card");
  }
}
