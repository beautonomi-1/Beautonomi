import { NextRequest } from "next/server";
import { successResponse, handleApiError, errorResponse, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { isPaystackEnabledForTenant } from "@/lib/subscriptions/entitlements";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getPaystackSecretKey } from "@/lib/payments/paystack-server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import {
  resolveBookingPaystackAmount,
  resolveProductOrderPaystackAmount,
} from "@/lib/payments/resolve-paystack-initialize-amount";
import { revalidateBookingSlotBeforePayment } from "@/lib/bookings/revalidate-booking-slot-before-payment";
import { z } from "zod";

const initializeSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    /** Ignored when paying for a product order or booking — server derives amount. */
    amount: z.number().min(100, "Minimum amount is 100").optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    /** Optional mobile/native return target. Must be a trusted app/web URL. */
    callback_url: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => {
          if (!v) return true;
          return (
            v.startsWith("https://") ||
            v.startsWith("http://") ||
            v.startsWith("customer://") ||
            v.startsWith("exp://")
          );
        },
        { message: "Invalid callback URL" },
      ),
  })
  .superRefine((val, ctx) => {
    const m = val.metadata || {};
    const hasProductOrder =
      typeof m.product_order_id === "string" && String(m.product_order_id).trim().length > 0;
    const hasBooking =
      (typeof m.bookingId === "string" && String(m.bookingId).trim().length > 0) ||
      (typeof m.booking_id === "string" && String(m.booking_id).trim().length > 0);
    if (!hasProductOrder && !hasBooking && (val.amount == null || val.amount < 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "amount is required (min 100) unless paying for a product order or booking",
        path: ["amount"],
      });
    }
  });

/**
 * POST /api/paystack/initialize
 * 
 * Initialize Paystack payment.
 * Accepts arbitrary metadata including save_card, booking IDs, etc.
 */
export async function POST(request: NextRequest) {
  try {
    let tenantId: string;
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
    } catch {
      return errorResponse(
        "This site is not configured for payments. Please use the correct market URL.",
        "TENANT_UNAVAILABLE",
        503,
      );
    }

    const paystackEnabled = await isPaystackEnabledForTenant(tenantId);
    if (!paystackEnabled) {
      return errorResponse(
        "Online card payment is currently unavailable.",
        "FEATURE_DISABLED",
        403
      );
    }

    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const body = initializeSchema.parse(await request.json());

    const rawMeta = body.metadata || {};
    const bookingIdForCallback =
      (typeof rawMeta.bookingId === "string" && rawMeta.bookingId.trim()
        ? rawMeta.bookingId.trim()
        : null) ||
      (typeof rawMeta.booking_id === "string" && rawMeta.booking_id.trim()
        ? rawMeta.booking_id.trim()
        : null);
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com";
    const defaultCallbackUrl =
      rawMeta.type === "product_order"
        ? `${appBaseUrl}/shop/payment-callback`
        : bookingIdForCallback
          ? `${appBaseUrl}/checkout/success?booking_id=${encodeURIComponent(bookingIdForCallback)}`
          : `${appBaseUrl}/checkout/success`;
    const callbackUrl = body.callback_url?.trim() || defaultCallbackUrl;

    // cancel_action: respect explicitly supplied value; otherwise default by type
    const customOfferIdRaw =
      typeof rawMeta.custom_offer_id === "string" && rawMeta.custom_offer_id.trim()
        ? rawMeta.custom_offer_id.trim()
        : null;
    const isMobileCallback =
      callbackUrl.startsWith("customer://") || callbackUrl.startsWith("exp://");
    const defaultCancelAction = isMobileCallback
      ? `${callbackUrl}${callbackUrl.includes("?") ? "&" : "?"}cancelled=1`
      : rawMeta.type === "product_order"
        ? `${appBaseUrl}/shop/cancelled`
        : customOfferIdRaw
          ? `${appBaseUrl}/checkout/cancelled?payment_type=custom_offer&offer_id=${encodeURIComponent(customOfferIdRaw)}`
          : bookingIdForCallback
            ? `${appBaseUrl}/checkout/cancelled?booking_id=${encodeURIComponent(bookingIdForCallback)}`
            : `${appBaseUrl}/checkout/cancelled`;
    const rawCancelAction =
      typeof rawMeta.cancel_action === "string" ? rawMeta.cancel_action.trim() : "";
    // Resolve relative paths ("/shop/cancelled?…") to absolute URLs for Paystack.
    const cancelAction = rawCancelAction
      ? rawCancelAction.startsWith("/")
        ? `${appBaseUrl}${rawCancelAction}`
        : rawCancelAction
      : defaultCancelAction;
    const supabase = await getSupabaseServer(request);

    const productOrderIdRaw =
      typeof rawMeta.product_order_id === "string" && rawMeta.product_order_id.trim()
        ? rawMeta.product_order_id.trim()
        : null;
    if (productOrderIdRaw) {
      const { data: po, error: poErr } = await supabase
        .from("product_orders")
        .select("id, tenant_id, customer_id")
        .eq("id", productOrderIdRaw)
        .maybeSingle();
      if (poErr || !po) {
        return errorResponse("Order not found", "NOT_FOUND", 404);
      }
      const poRow = po as { tenant_id?: string | null; customer_id?: string | null };
      if (!resourceTenantMatchesHostTenant(tenantId, poRow.tenant_id)) {
        return errorResponse(
          "This order belongs to a different market. Open checkout from the correct site or app for this order.",
          "TENANT_MISMATCH",
          403,
        );
      }
      if (poRow.customer_id !== user.id) {
        return errorResponse(
          "You do not have permission to pay for this order",
          "FORBIDDEN",
          403,
        );
      }
    }

    if (customOfferIdRaw && !productOrderIdRaw && !bookingIdForCallback) {
      const { data: offerRow, error: offerErr } = await supabase
        .from("custom_offers")
        .select("id, status, provider_id, request:custom_requests(customer_id, provider_id)")
        .eq("id", customOfferIdRaw)
        .maybeSingle();
      if (offerErr || !offerRow) {
        return errorResponse("Custom offer not found", "NOT_FOUND", 404);
      }
      const offer = offerRow as {
        provider_id?: string | null;
        request?: { customer_id?: string | null; provider_id?: string | null } | null;
      };
      const customerId =
        offer.request?.customer_id ?? null;
      if (customerId !== user.id) {
        return errorResponse(
          "You do not have permission to pay for this offer",
          "FORBIDDEN",
          403,
        );
      }
      const providerIdForTenant = offer.provider_id ?? offer.request?.provider_id ?? null;
      if (providerIdForTenant) {
        const { data: provRow } = await supabase
          .from("providers")
          .select("tenant_id")
          .eq("id", providerIdForTenant)
          .maybeSingle();
        if (
          !resourceTenantMatchesHostTenant(
            tenantId,
            (provRow as { tenant_id?: string | null } | null)?.tenant_id,
          )
        ) {
          return errorResponse(
            "This offer belongs to a different market. Open checkout from the correct site or app for this offer.",
            "TENANT_MISMATCH",
            403,
          );
        }
      }
    }

    const bookingIdFromMeta = bookingIdForCallback;
    if (bookingIdFromMeta && !productOrderIdRaw) {
      const { data: bookingRow, error: bookingErr } = await supabase
        .from("bookings")
        .select("id, tenant_id, customer_id")
        .eq("id", bookingIdFromMeta)
        .maybeSingle();
      if (bookingErr || !bookingRow) {
        return errorResponse("Booking not found", "NOT_FOUND", 404);
      }
      if (!resourceTenantMatchesHostTenant(tenantId, bookingRow.tenant_id)) {
        return errorResponse(
          "This booking belongs to a different market. Open checkout from the correct site or app for this booking.",
          "TENANT_MISMATCH",
          403,
        );
      }
      if (bookingRow.customer_id !== user.id) {
        return errorResponse(
          "You do not have permission to pay for this booking",
          "FORBIDDEN",
          403,
        );
      }
    }

    let paystackAmount = body.amount ?? 0;
    if (productOrderIdRaw) {
      const resolved = await resolveProductOrderPaystackAmount(supabase, productOrderIdRaw, user.id);
      if (resolved.ok === false) {
        return errorResponse(resolved.message, resolved.code, resolved.status);
      }
      paystackAmount = resolved.amountSmallestUnit;
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
      paystackAmount = resolved.amountSmallestUnit;
    }

    const PAYSTACK_SECRET_KEY = await getPaystackSecretKey({ tenantId });
    
    if (!PAYSTACK_SECRET_KEY) {
      throw new Error("Paystack secret key not configured");
    }

    const saveCard = rawMeta.saveCard === "true" || rawMeta.saveCard === true;
    const setAsDefault = rawMeta.setAsDefault === "true" || rawMeta.setAsDefault === true;

    // Resolve split_code and subaccount for booking/order payments (matches payments/initialize)
    let splitCode: string | undefined;
    let subaccount: string | undefined;
    const admin = getSupabaseAdmin();

    if (bookingIdFromMeta || productOrderIdRaw) {
      const { data: payoutSettings } = await admin
        .from("platform_settings")
        .select("settings")
        .eq("key", "payouts")
        .maybeSingle();
      const settings = (payoutSettings as any)?.settings;
      if (settings?.use_transaction_splits) {
        const { data: activeSplit } = await admin
          .from("paystack_splits")
          .select("split_code")
          .eq("active", true)
          .maybeSingle();
        if (activeSplit) splitCode = (activeSplit as any).split_code;
      }
    }

    if (bookingIdFromMeta) {
      const { data: bRow } = await admin
        .from("bookings")
        .select("provider_id")
        .eq("id", bookingIdFromMeta)
        .maybeSingle();
      if ((bRow as any)?.provider_id) {
        const { data: provSub } = await admin
          .from("provider_paystack_subaccounts")
          .select("subaccount_code")
          .eq("provider_id", (bRow as any).provider_id)
          .eq("active", true)
          .maybeSingle();
        if (provSub) subaccount = (provSub as any).subaccount_code;
      }
    }

    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: body.email,
        amount: paystackAmount,
        metadata: {
          ...rawMeta,
          ...(bookingIdFromMeta ? { booking_id: bookingIdFromMeta } : {}),
          save_card: saveCard,
          set_as_default: setAsDefault,
          customer_id: user.id,
          cancel_action: cancelAction,
          custom_fields: [
            ...(rawMeta.bookingId || rawMeta.booking_id
              ? [
                  {
                    display_name: "Booking ID",
                    variable_name: "booking_id",
                    value: (typeof rawMeta.bookingId === "string" && rawMeta.bookingId
                      ? rawMeta.bookingId
                      : rawMeta.booking_id) as string,
                  },
                ]
              : []),
          ],
        },
        ...(splitCode ? { split_code: splitCode } : {}),
        ...(subaccount ? { subaccount } : {}),
        callback_url: callbackUrl,
      }),
    });

    if (!paystackResponse.ok) {
      const error = await paystackResponse.json();
      throw new Error(error.message || "Failed to initialize payment");
    }

    const data = await paystackResponse.json();
    const paystackReference: string = data.data.reference;

    // M1 guard: persist Paystack reference back to source rows so reconciliation
    // and webhook processing can always find the row by reference.
    if (paystackReference) {
      if (bookingIdFromMeta) {
        await Promise.resolve(
          admin
            .from("bookings")
            .update({ payment_reference: paystackReference, payment_status: "pending" })
            .eq("id", bookingIdFromMeta)
        ).then(() => void 0).catch((err: unknown) =>
          console.error("[paystack/initialize] failed to persist booking payment_reference:", err),
        );
      } else if (productOrderIdRaw) {
        await Promise.resolve(
          admin
            .from("product_orders")
            .update({ payment_reference: paystackReference })
            .eq("id", productOrderIdRaw)
        ).then(() => void 0).catch((err: unknown) =>
          console.error("[paystack/initialize] failed to persist product_order payment_reference:", err),
        );
      }
    }

    return successResponse({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to initialize payment");
  }
}
