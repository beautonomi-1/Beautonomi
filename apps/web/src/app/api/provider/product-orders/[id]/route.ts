import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  applyProductOrderCancelRefundSideEffects,
} from "@/lib/orders/product-order-lifecycle";
import {
  dispatchProductOrderStatusNotification,
  type ProductOrderNotifyStatus,
} from "@/lib/notifications/notify-product-order-status";
import { z } from "zod";

const NOTIFY_STATUSES = new Set<ProductOrderNotifyStatus>([
  "confirmed",
  "shipped",
  "ready_for_collection",
  "delivered",
  "cancelled",
  "refunded",
]);

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
    const permissionCheck = await requirePermission("view_sales", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
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
          id, full_name, email, avatar_url, phone, identity_verified
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
    const body = await request.json();
    const parsed = updateSchema.parse(body);
    const isMoneyAction =
      parsed.status === "refunded" ||
      parsed.refund_amount != null ||
      Boolean(parsed.refund_reason?.trim());
    const permissionCheck = await requirePermission(
      isMoneyAction ? "process_payments" : "view_sales",
      request,
    );
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

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
        // §Product-refund-confirmation: in-person cash refunds to a real
        // customer account are flagged for confirmation/dispute (parity with
        // booking cash refunds). No wallet money moves — this is an audit trail.
        if (refundMethod === "cash" && order.customer_id) {
          updatePayload.refund_customer_confirmation_required = true;
          updatePayload.refund_confirmation_deadline_at = new Date(
            Date.now() + 48 * 60 * 60 * 1000,
          ).toISOString();
        }
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
    if (parsed.status === "cancelled" || parsed.status === "refunded") {
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
              /* best effort */
            }
          } else {
            try {
              await supabase.rpc("increment_product_stock" as any, {
                p_product_id: item.product_id,
                p_quantity: item.quantity,
              });
            } catch {
              /* best effort */
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
        p_idempotency_key: `product_order_refund:${id}`,
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

    // Reverse platform-held revenue on the ledger and credit wallet when cancelling
    // or refunding a paid order (shared with admin route).
    if (
      parsed.status === "refunded" ||
      (parsed.status === "cancelled" && order.payment_status === "paid")
    ) {
      await applyProductOrderCancelRefundSideEffects(
        supabase,
        getSupabaseAdmin(),
        order,
        {
          newStatus: parsed.status === "refunded" ? "refunded" : "cancelled",
          refundAmount,
          cancellationReason: parsed.cancellation_reason,
          refundReason: parsed.refund_reason,
        },
      );
    }

    // Dispatch notification to customer based on status change
    if (parsed.status && parsed.status !== order.status && updated?.customer?.id) {
      const needsRefundConfirmation =
        parsed.status === "refunded" && refundMethod === "cash" && !!order.customer_id;

      if (
        NOTIFY_STATUSES.has(parsed.status as ProductOrderNotifyStatus) &&
        !needsRefundConfirmation
      ) {
        await dispatchProductOrderStatusNotification({
          supabase,
          customerId: updated.customer.id,
          status: parsed.status as ProductOrderNotifyStatus,
          orderId: id,
          orderNumber: String(updated.order_number ?? id.slice(0, 8)),
          tenantId: order.tenant_id ?? null,
          providerId,
          collectionLocationId: (updated as { collection_location_id?: string | null })
            .collection_location_id,
          cancellationReason: parsed.cancellation_reason,
          trackingNumber: parsed.tracking_number ?? (updated as { tracking_number?: string }).tracking_number,
          carrier: parsed.carrier ?? (updated as { carrier?: string }).carrier,
          estimatedDelivery:
            parsed.estimated_delivery_date ??
            (updated as { estimated_delivery_date?: string }).estimated_delivery_date,
          refundAmount: parsed.status === "refunded" ? refundAmount : null,
        });
      }

      // §Product-refund-confirmation: send the confirm/dispute request for
      // in-person cash refunds so the customer can flag a discrepancy.
      if (needsRefundConfirmation) {
        try {
          const { data: providerRow } = await (supabase.from("providers") as any)
            .select("business_name")
            .eq("id", providerId)
            .maybeSingle();
          const providerName =
            (providerRow as { business_name?: string } | null)?.business_name ?? "Your provider";
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://beautonomi.com";
          const { sendTemplateNotification } = await import(
            "@/lib/notifications/onesignal"
          );
          await sendTemplateNotification(
            "product_order_cash_refund_confirmation",
            [order.customer_id],
            {
              amount: `${order.currency || LAST_RESORT_CURRENCY} ${refundAmount.toFixed(2)}`,
              order_number: updated.order_number ?? id.slice(0, 8),
              order_id: id,
              provider_name: providerName,
              confirm_url: `${baseUrl}/account-settings/orders/${id}?refund_confirm=1`,
              dispute_url: `${baseUrl}/account-settings/orders/${id}?refund_dispute=1`,
            },
            ["push", "email", "sms"],
            { appType: "customer", tenantId: order.tenant_id ?? null },
          );
        } catch (confirmErr) {
          console.warn("Product order cash refund confirmation notify failed:", confirmErr);
        }
      }
    }

    return successResponse({ order: updated });
  } catch (err) {
    return handleApiError(err, "Failed to update order");
  }
}
