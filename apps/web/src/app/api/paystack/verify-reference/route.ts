import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getPaystackSecretKey } from "@/lib/payments/paystack-server";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processSuccessfulPayment } from "@/app/api/payments/webhook/_handlers/charge-success";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";

/**
 * GET /api/paystack/verify-reference?reference=...&booking_id=...
 *
 * Server-side verification against Paystack (see https://paystack.com/docs/payments/accept-payments/).
 * Replays idempotent fulfillment so redirects can reconcile before webhooks arrive.
 * When booking_id is provided, checks ownership and amount vs expected outstanding/charge.
 */
type PaystackVerifyApiResponse = {
  status: boolean;
  message?: string;
  data?: {
    status?: string;
    amount?: number;
    currency?: string;
    reference?: string;
    metadata?: Record<string, unknown>;
    fees?: number;
    customer?: {
      email?: string;
      customer_code?: string;
    };
  };
};

type ProductOrderPaymentRow = {
  tenant_id?: string | null;
  provider_id?: string | null;
  customer_id?: string | null;
  total_amount?: number | string | null;
  wallet_amount?: number | string | null;
  payment_status?: string | null;
  payment_reference?: string | null;
};

type ProductOrderNotificationRow = {
  customer_id?: string | null;
  provider_id?: string | null;
  order_number?: string | null;
};

type MaybeSingleProductOrderQuery<T> = {
  select(columns: string): {
    eq(column: string, value: string): {
      maybeSingle(): Promise<{ data: T | null; error: unknown }>;
    };
  };
};

type ProductOrdersReader<T> = {
  from(table: "product_orders"): MaybeSingleProductOrderQuery<T>;
};

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("reference")?.trim();
    const bookingIdParam = searchParams.get("booking_id")?.trim();

    if (!reference) {
      return errorResponse("reference is required", "VALIDATION_ERROR", 400);
    }

    const secretKey = await getPaystackSecretKey({ tenantId });
    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
      }
    );

    const json = (await paystackRes.json()) as PaystackVerifyApiResponse;

    if (!paystackRes.ok || !json.status || !json.data) {
      return successResponse({
        verified: false,
        paystackStatus: json.data?.status ?? "unknown",
        message: json.message || "Could not verify transaction with Paystack",
      });
    }

    const d = json.data;
    const txStatus = d.status || "";
    const amountKobo = Number(d.amount ?? 0);
    const amountInCurrency = convertFromSmallestUnit(amountKobo);
    const metadata = (d.metadata || {}) as Record<string, unknown>;
    const supabase = await getSupabaseServer(request);

    if (txStatus !== "success") {
      return successResponse({
        verified: false,
        paystackStatus: txStatus,
        message:
          txStatus === "failed"
            ? "Payment was not successful"
            : "Payment is not complete yet",
      });
    }

    const productOrderId =
      typeof metadata.product_order_id === "string" && metadata.product_order_id.trim()
        ? metadata.product_order_id.trim()
        : null;
    if (productOrderId && !bookingIdParam) {
      const productOrders = supabase as unknown as ProductOrdersReader<ProductOrderPaymentRow>;
      const { data: poBefore, error: poError } = await productOrders
        .from("product_orders")
        .select("id, tenant_id, provider_id, customer_id, total_amount, wallet_amount, payment_status, payment_reference")
        .eq("id", productOrderId)
        .maybeSingle();

      if (poError || !poBefore) {
        return notFoundResponse("Product order not found");
      }

      const order = poBefore;

      if (!resourceTenantMatchesHostTenant(tenantId, order.tenant_id)) {
        return errorResponse(
          "This order belongs to a different market. Open checkout from the correct site or app for this order.",
          "TENANT_MISMATCH",
          403,
        );
      }

      if (order.customer_id !== user.id) {
        return errorResponse(
          "You can only confirm payment for your own order.",
          "FORBIDDEN",
          403,
        );
      }

      const existingReference = order.payment_reference ?? null;
      if (String(order.payment_status ?? "") !== "pending" && existingReference !== (d.reference ?? reference)) {
        return errorResponse(
          "This order does not require online payment.",
          "ORDER_NOT_PAYABLE",
          400,
        );
      }

      const expectedMajor = Math.max(
        0,
        Number(order.total_amount ?? 0) - Number(order.wallet_amount ?? 0),
      );
      if (Math.abs(amountInCurrency - expectedMajor) > 0.01 && existingReference !== (d.reference ?? reference)) {
        return successResponse({
          verified: false,
          paystackStatus: txStatus,
          message: "Paid amount does not match this order",
          code: "AMOUNT_MISMATCH",
        });
      }

      const admin = getSupabaseAdmin();
      await recordProductOrderPayment({
        supabase: admin,
        productOrderId,
        reference: d.reference ?? reference,
        amountMajor: amountInCurrency,
        feesMajor: convertFromSmallestUnit(Number(d.fees ?? 0)),
        source: "paystack_verify",
        provider: "paystack",
      });

      const productOrderTenantId = await resolveTenantIdForFinanceLedger(admin, {
        tenant_id: order.tenant_id,
        provider_id: order.provider_id,
      });
      const { format: formatMoney } = await import("@/lib/money/tenant-intl-format").then((m) =>
        m.getTenantMoneyFormatter(productOrderTenantId),
      );

      try {
        const adminProductOrders = admin as unknown as ProductOrdersReader<ProductOrderNotificationRow>;
        const { data: po } = await adminProductOrders
          .from("product_orders")
          .select("customer_id, provider_id, order_number")
          .eq("id", productOrderId)
          .maybeSingle();
        if (po?.customer_id) {
          const { insertNotification } = await import("@/lib/notifications/insert-notification");
          await insertNotification({
            user_id: po.customer_id,
            type: "product_order_update",
            title: "Order Confirmed",
            message: `Your order ${po.order_number} has been confirmed and paid.`,
            data: { product_order_id: productOrderId, amount: amountInCurrency },
            action_url: `/product-orders`,
          });
        }
        if (po?.provider_id) {
          const { notifyProviderTeamUsers } = await import("@/lib/notifications/notify-provider-team");
          await notifyProviderTeamUsers(po.provider_id, {
            type: "product_order_update",
            title: "New Product Order",
            message: `New product order ${po.order_number} received - ${formatMoney(amountInCurrency)}.`,
            data: { product_order_id: productOrderId, amount: amountInCurrency },
            action_url: `/provider/ecommerce/orders?order=${encodeURIComponent(productOrderId)}`,
          });
        }
      } catch (notificationError) {
        console.warn("Product order verification notification failed:", notificationError);
      }

      return successResponse({
        verified: true,
        paystackStatus: txStatus,
        amount: amountInCurrency,
        currency: d.currency ?? lastResortCurrency,
        reference: d.reference ?? reference,
        metadata,
        productOrderId,
        type: "product_order",
      });
    }

    if (!bookingIdParam) {
      return successResponse({
        verified: true,
        paystackStatus: txStatus,
        amount: amountInCurrency,
        currency: d.currency ?? lastResortCurrency,
        reference: d.reference ?? reference,
        metadata,
      });
    }

    const metaBookingId = (metadata.booking_id || metadata.bookingId) as string | undefined;
    if (metaBookingId && metaBookingId !== bookingIdParam) {
      return errorResponse(
        "This payment does not belong to this booking",
        "BOOKING_MISMATCH",
        403
      );
    }

    // §Customer-launch (audit 2026-04): honour Bearer tokens from
    // mobile clients (otherwise the RLS-scoped SELECT below silently
    // fails and every mobile payment verification gets "Booking not
    // found"). The `user` id used in the ownership check below is
    // already resolved via `requireRoleInApi(request)` above.
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, tenant_id, customer_id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status, additional_charges(amount,status)")
      .eq("id", bookingIdParam)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    if (!resourceTenantMatchesHostTenant(tenantId, booking.tenant_id)) {
      return errorResponse(
        "This booking belongs to a different market. Open checkout from the correct site or app for this booking.",
        "TENANT_MISMATCH",
        403,
      );
    }

    if (booking.customer_id !== user.id) {
      return errorResponse("Forbidden", "FORBIDDEN", 403);
    }

    const paymentType = metadata.payment_type as string | undefined;
    const chargeId = (metadata.additional_charge_id || metadata.charge_id) as string | undefined;

    if (paymentType === "booking_remaining") {
      const unpaidAdditionalCharges = Array.isArray((booking as any).additional_charges)
        ? (booking as any).additional_charges
            .filter((charge: any) => charge?.status !== "paid" && charge?.status !== "rejected")
            .reduce((sum: number, charge: any) => sum + Number(charge?.amount || 0), 0)
        : 0;
      const remaining = computeBookingOutstandingDisplay({
        totalAmount: Number(booking.total_amount ?? 0),
        totalPaid: Number(booking.total_paid ?? 0),
        totalRefunded: Number((booking as any).total_refunded ?? 0),
        walletAmount: Number((booking as any).wallet_amount ?? 0),
        giftCardAmount: Number((booking as any).gift_card_amount ?? 0),
        unpaidAdditionalCharges,
        paymentStatus: (booking as any).payment_status ?? null,
      });

      if (remaining > 0.02) {
        if (Math.abs(amountInCurrency - remaining) > 0.02) {
          return successResponse({
            verified: false,
            paystackStatus: txStatus,
            message: "Paid amount does not match the outstanding balance",
            code: "AMOUNT_MISMATCH",
          });
        }
      }
    } else if (chargeId) {
      const { data: charge, error: chargeErr } = await supabase
        .from("additional_charges")
        .select("id, amount, booking_id, status")
        .eq("id", chargeId)
        .eq("booking_id", bookingIdParam)
        .maybeSingle();

      if (chargeErr || !charge) {
        return notFoundResponse("Additional charge not found");
      }

      const ch = charge as { amount?: number; status?: string };
      if (ch.status !== "paid") {
        const expected = Number(ch.amount ?? 0);
        if (Math.abs(amountInCurrency - expected) > 0.02) {
          return successResponse({
            verified: false,
            paystackStatus: txStatus,
            message: "Paid amount does not match this charge",
            code: "AMOUNT_MISMATCH",
          });
        }
      }
    }

    await processSuccessfulPayment(
      {
        reference: d.reference ?? reference,
        metadata,
        amount: d.amount,
        fees: d.fees,
        customer: d.customer,
      },
      getSupabaseAdmin(),
    );

    return successResponse({
      verified: true,
      paystackStatus: txStatus,
      amount: amountInCurrency,
      currency: d.currency ?? lastResortCurrency,
      reference: d.reference ?? reference,
      metadata,
    });
  } catch (error) {
    return handleApiError(error, "Failed to verify payment");
  }
}
