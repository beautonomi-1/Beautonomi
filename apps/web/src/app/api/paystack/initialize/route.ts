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

    const bookingIdFromMeta =
      (typeof rawMeta.bookingId === "string" && rawMeta.bookingId.trim()
        ? rawMeta.bookingId.trim()
        : null) ||
      (typeof rawMeta.booking_id === "string" && rawMeta.booking_id.trim()
        ? rawMeta.booking_id.trim()
        : null);
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
        callback_url: rawMeta.type === "product_order"
          ? `${process.env.NEXT_PUBLIC_APP_URL}/shop/payment-callback`
          : `${process.env.NEXT_PUBLIC_APP_URL}/booking/callback`,
      }),
    });

    if (!paystackResponse.ok) {
      const error = await paystackResponse.json();
      throw new Error(error.message || "Failed to initialize payment");
    }

    const data = await paystackResponse.json();

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
