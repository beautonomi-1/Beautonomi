import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { z } from "zod";

const updateSchema = z.object({
  status: z
    .enum([
      "pending",
      "confirmed",
      "processing",
      "ready_for_collection",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
    ])
    .optional(),
  tracking_number: z.string().max(100).optional(),
  carrier: z.string().max(100).optional(),
  // §Customer-audit 2026-04 (follow-up): accept an optional tracking URL so
  // customer surfaces can render it as a tappable link. Accept empty string
  // as "clear" to make wiping a previously-saved URL a no-special-case op.
  tracking_url: z.string().url().max(500).optional().or(z.literal("")),
  estimated_delivery_date: z.string().optional(),
  cancellation_reason: z.string().max(500).optional(),
  // §Refund-audit 2026-05: when marking an order refunded, capture how the money
  // was returned. "cash" = handed back in person (walk-in counter sale), no
  // wallet movement. "store_credit" = added to the customer's wallet (requires a
  // platform customer). Defaults to store_credit for parity with booking refunds.
  refund_method: z.enum(["cash", "store_credit"]).optional(),
  refund_amount: z.number().min(0).optional(),
  refund_reason: z.string().max(500).optional(),
});

const TERMINAL_STATUSES = new Set(["cancelled", "refunded"]);

/**
 * GET /api/provider/product-orders/[id]
 * Get order detail for provider
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: order, error } = await (supabase.from("product_orders") as any)
      .select(
        `
        *,
        items:product_order_items (
          id, product_id, product_variant_id, product_name, product_image_url, quantity, unit_price, total_price,
          product_variant:product_variants(id, option_values)
        ),
        customer:users!product_orders_customer_id_fkey (
          id, full_name, email, avatar_url, phone
        ),
        delivery_address:user_addresses (
          id, label, address_line1, address_line2, city, state, postal_code, country,
          apartment_unit, building_name, floor_number, parking_instructions, location_landmarks
        ),
        collection_location:provider_locations (
          id, name, address_line1, city
        )
      `,
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !order) {
      return notFoundResponse("Order not found");
    }

    return successResponse({ order });
  } catch (err) {
    return handleApiError(err, "Failed to fetch order");
  }
}

/**
 * PATCH /api/provider/product-orders/[id]
 * Update order status with transition validation
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const body = await request.json();
    const parsed = updateSchema.parse(body);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    // Get current order
    const { data: order, error: fetchErr } = await (supabase.from("product_orders") as any)
      .select(
        "id, status, provider_id, payment_status, total_amount, customer_id, currency, tenant_id, order_number",
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchErr || !order) {
      return notFoundResponse("Order not found");
    }

    // Resolve refund method/amount up front so we can validate before mutating.
    const refundMethod: "cash" | "store_credit" =
      parsed.refund_method ?? "store_credit";
    const refundAmount =
      parsed.refund_amount != null
        ? parsed.refund_amount
        : Number(order.total_amount ?? 0);

    // Flexible operational status management with guardrails for destructive states.
    if (parsed.status) {
      if (TERMINAL_STATUSES.has(order.status) && parsed.status !== order.status) {
        return errorResponse(
          `Cannot change a ${order.status} order.`,
          "INVALID_TRANSITION",
          400,
        );
      }
      if (parsed.status === "cancelled" && order.payment_status === "paid" && !parsed.cancellation_reason?.trim()) {
        return errorResponse(
          "Please include a cancellation reason for paid orders.",
          "CANCELLATION_REASON_REQUIRED",
          400,
        );
      }
      if (parsed.status === "refunded" && order.payment_status !== "paid") {
        return errorResponse(
          "Only paid orders can be marked as refunded.",
          "INVALID_REFUND_STATUS",
          400,
        );
      }
      if (parsed.status === "refunded") {
        if (refundAmount <= 0 || refundAmount > Number(order.total_amount ?? 0) + 0.01) {
          return errorResponse(
            `Refund amount must be between 0 and ${Number(order.total_amount ?? 0).toFixed(2)}.`,
            "INVALID_REFUND_AMOUNT",
            400,
          );
        }
        // Store credit needs a platform customer to credit. Walk-in sales
        // (customer_id NULL) must be refunded in person instead.
        if (refundMethod === "store_credit" && !order.customer_id) {
          return errorResponse(
            "This order has no customer account to credit. Refund in person (cash) instead.",
            "NO_WALLET_CUSTOMER",
            400,
          );
        }
      }
    }

    // Build update payload
    const updatePayload: Record<string, any> = {};
    if (parsed.status) {
      updatePayload.status = parsed.status;
      if (parsed.status === "confirmed") updatePayload.confirmed_at = new Date().toISOString();
      if (parsed.status === "shipped") updatePayload.shipped_at = new Date().toISOString();
      if (parsed.status === "delivered") updatePayload.delivered_at = new Date().toISOString();
      if (parsed.status === "cancelled") {
        updatePayload.cancelled_at = new Date().toISOString();
        updatePayload.cancellation_reason = parsed.cancellation_reason ?? null;
      }
      if (parsed.status === "refunded") {
        updatePayload.payment_status = "refunded";
        updatePayload.refund_method = refundMethod;
        updatePayload.refunded_amount = refundAmount;
        updatePayload.refunded_at = new Date().toISOString();
        if (parsed.refund_reason) updatePayload.refund_reason = parsed.refund_reason;
      }
    }
    if (parsed.tracking_number) updatePayload.tracking_number = parsed.tracking_number;
    if (parsed.carrier) updatePayload.carrier = parsed.carrier;
    if (parsed.tracking_url !== undefined) {
      // Empty string = explicit clear; otherwise store the validated URL.
      updatePayload.tracking_url = parsed.tracking_url === "" ? null : parsed.tracking_url;
    }
    if (parsed.estimated_delivery_date)
      updatePayload.estimated_delivery_date = parsed.estimated_delivery_date;

    // On cancellation, restore stock (variant or product-level)
    if (parsed.status === "cancelled") {
      const { data: items } = await (supabase.from("product_order_items") as any)
        .select("product_id, product_variant_id, quantity")
        .eq("order_id", id);

      if (items) {
        for (const item of items) {
          if (item.product_variant_id) {
            try {
              await (supabase.rpc as any)("increment_product_variant_stock", {
                p_variant_id: item.product_variant_id,
                p_quantity: item.quantity,
              });
            } catch {
              const { data: v } = await (supabase.from("product_variants") as any)
                .select("quantity")
                .eq("id", item.product_variant_id)
                .single();
              if (v) {
                await (supabase.from("product_variants") as any)
                  .update({ quantity: (v.quantity ?? 0) + item.quantity })
                  .eq("id", item.product_variant_id);
              }
            }
          } else {
            try {
              await supabase.rpc("increment_product_stock" as any, {
                p_product_id: item.product_id,
                p_quantity: item.quantity,
              });
            } catch {
              const { data: prod } = await (supabase.from("products") as any)
                .select("quantity")
                .eq("id", item.product_id)
                .single();
              if (prod) {
                await (supabase.from("products") as any)
                  .update({ quantity: (prod.quantity ?? 0) + item.quantity })
                  .eq("id", item.product_id);
              }
            }
          }
        }
      }
    }

    const { data: updated, error: updateErr } = await (supabase.from("product_orders") as any)
      .update(updatePayload)
      .eq("id", id)
      .select("*, customer:users!product_orders_customer_id_fkey(id, full_name)")
      .single();

    if (updateErr) throw updateErr;

    // Store-credit refunds add the amount to the customer's wallet. Cash refunds
    // are simply recorded (the money is handed back in person). Mirrors the
    // booking refund flow so reports/ledgers reconcile across services + products.
    if (parsed.status === "refunded" && refundMethod === "store_credit" && order.customer_id) {
      const admin = getSupabaseAdmin();
      const { error: walletError } = await (admin.rpc as any)("wallet_credit_admin", {
        p_user_id: order.customer_id,
        p_amount: refundAmount,
        p_currency: order.currency || LAST_RESORT_CURRENCY,
        p_description: `Refund for order ${order.order_number || id.slice(0, 8)}${parsed.refund_reason ? `: ${parsed.refund_reason}` : ""}`,
        p_reference_id: id,
        p_reference_type: "product_order_refund",
        p_tenant_id: order.tenant_id ?? null,
      });
      if (walletError) {
        // Roll back the refund flags so the operator can retry; the order stays
        // in its prior paid state rather than being marked refunded with no
        // wallet credit actually issued.
        await (supabase.from("product_orders") as any)
          .update({
            payment_status: order.payment_status,
            status: order.status,
            refund_method: null,
            refunded_amount: null,
            refunded_at: null,
            refund_reason: null,
          })
          .eq("id", id);
        return errorResponse(
          "Could not credit the customer's wallet. The refund was not recorded.",
          "WALLET_CREDIT_FAILED",
          500,
        );
      }
    }

    // Reverse platform-held revenue on the ledger so provider earnings, payouts,
    // and refund reporting stay correct (not overstated). Only platform-held
    // orders (paystack/wallet) created finance rows; provider-collected cash/POS
    // sales were intentionally excluded from the ledger (see
    // record-product-order-payment) and the product sales report already drops
    // refunded orders via payment_status, so they need no reversal. We post a
    // single `refund` row keyed to the product order — matching the booking
    // refund trigger's shape — regardless of cash vs wallet, because the
    // recognised revenue is reversed either way.
    if (parsed.status === "refunded") {
      const admin = getSupabaseAdmin();
      const { data: ledgerRows } = await (admin.from("finance_transactions") as any)
        .select("id, tenant_id")
        .eq("product_order_id", id)
        .in("transaction_type", ["payment", "provider_earnings", "platform_fee"])
        .limit(1);
      const isPlatformHeld = Array.isArray(ledgerRows) && ledgerRows.length > 0;
      if (isPlatformHeld) {
        const ledgerTenantId =
          (ledgerRows[0] as { tenant_id?: string | null })?.tenant_id ?? order.tenant_id ?? null;
        const { data: existingRefund } = await (admin.from("finance_transactions") as any)
          .select("id")
          .eq("product_order_id", id)
          .eq("transaction_type", "refund")
          .limit(1);
        const alreadyReversed = Array.isArray(existingRefund) && existingRefund.length > 0;
        if (!alreadyReversed) {
          await (admin.from("finance_transactions") as any).insert({
            booking_id: null,
            product_order_id: id,
            provider_id: providerId,
            tenant_id: ledgerTenantId,
            transaction_type: "refund",
            refund_component: "_legacy",
            amount: refundAmount,
            fees: 0,
            commission: 0,
            net: -refundAmount,
            currency: order.currency || LAST_RESORT_CURRENCY,
            description: `Refund for product order ${order.order_number || id.slice(0, 8)}${parsed.refund_reason ? ` (${parsed.refund_reason})` : ""}`,
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    // Dispatch notification to customer based on status change
    if (parsed.status && updated?.customer?.id) {
      const notificationMap: Record<string, { type: string; title: string; message: string }> = {
        confirmed: {
          type: "product_order_confirmed",
          title: "Order Confirmed",
          message: `Your order ${updated.order_number} has been confirmed and is being prepared.`,
        },
        shipped: {
          type: "product_order_shipped",
          title: "Order Shipped",
          message: `Your order ${updated.order_number} has been shipped.${parsed.carrier ? ` via ${parsed.carrier}` : ""}${parsed.tracking_number ? ` Tracking: ${parsed.tracking_number}` : ""}`,
        },
        ready_for_collection: {
          type: "product_order_ready_collection",
          title: "Ready for Collection",
          message: `Your order ${updated.order_number} is ready for collection.`,
        },
        delivered: {
          type: "product_order_delivered",
          title: "Order Delivered",
          message: `Your order ${updated.order_number} has been delivered. Enjoy!`,
        },
        cancelled: {
          type: "product_order_cancelled",
          title: "Order Cancelled",
          message: `Your order ${updated.order_number} has been cancelled.${parsed.cancellation_reason ? ` Reason: ${parsed.cancellation_reason}` : ""}`,
        },
        refunded: {
          type: "product_order_refunded",
          title: refundMethod === "cash" ? "Refund Processed" : "Refund Added to Wallet",
          message:
            refundMethod === "cash"
              ? `Your refund for order ${updated.order_number} has been processed and returned to you in person.`
              : `Your refund for order ${updated.order_number} has been added to your wallet.`,
        },
      };

      const notif = notificationMap[parsed.status];
      if (notif) {
        void import("@/lib/notifications/insert-notification").then(({ insertNotification }) =>
          insertNotification({
            user_id: updated.customer.id,
            type: notif.type,
            title: notif.title,
            message: notif.message,
            data: {
              product_order_id: id,
              order_number: updated.order_number,
              status: parsed.status,
            },
            action_url: "/product-orders",
          })
        );
      }
    }

    return successResponse({ order: updated });
  } catch (err) {
    return handleApiError(err, "Failed to update order");
  }
}
