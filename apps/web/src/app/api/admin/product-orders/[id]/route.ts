import { NextRequest } from "next/server";
import { z } from "zod";
import { cancelCourierShipmentForOrder } from "@/lib/orders/shipping";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  notFoundResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  applyProductOrderCancelRefundSideEffects,
  releaseUnpaidProductOrderHolds,
  restockProductOrderLineItems,
} from "@/lib/orders/product-order-lifecycle";
import { splitProductOrderRefundTender } from "@/lib/ecommerce/product-order-refund-tender";
import {
  dispatchProductOrderStatusNotification,
  type ProductOrderNotifyStatus,
} from "@/lib/notifications/notify-product-order-status";

const patchOrderSchema = z.object({
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
  payment_status: z
    .enum(["pending", "paid", "refunded", "partially_refunded", "failed"])
    .optional(),
  tracking_number: z.string().optional().nullable(),
  tracking_url: z.string().optional().nullable(),
  admin_notes: z.string().optional().nullable(),
  cancellation_reason: z.string().max(500).optional(),
});

const NOTIFY_STATUSES = new Set<ProductOrderNotifyStatus>([
  "confirmed",
  "shipped",
  "ready_for_collection",
  "delivered",
  "cancelled",
  "refunded",
]);

const TERMINAL_STATUSES = new Set(["cancelled", "refunded"]);

/**
 * GET /api/admin/product-orders/[id] — full order for superadmin (tenant-scoped)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: order, error } = await (supabase.from("product_orders") as any)
      .select(
        `
        *,
        items:product_order_items (
          id, product_id, product_name, product_image_url, quantity, unit_price, total_price, created_at
        ),
        customer:users!product_orders_customer_id_fkey (
          id, full_name, email, avatar_url, phone
        ),
        delivery_address:user_addresses (
          id, label, address_line1, address_line2, city, state, postal_code, country,
          latitude, longitude,
          apartment_unit, building_name, floor_number, parking_instructions, location_landmarks
        ),
        collection_location:provider_locations (
          id, name, address_line1, address_line2, city, state, postal_code, country,
          latitude, longitude, phone, location_type, is_active
        ),
        provider:providers!inner (
          id, business_name, slug, tenant_id, email, phone
        )
      `,
      )
      .eq("id", id)
      .eq("provider.tenant_id", tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!order) {
      return notFoundResponse("Order not found");
    }

    return successResponse({ order });
  } catch (err) {
    return handleApiError(err, "Failed to fetch product order");
  }
}

/**
 * PATCH /api/admin/product-orders/[id] — update order status / payment / tracking
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);
    const { id } = await params;
    const body = await request.json();
    const parsed = patchOrderSchema.parse(body);

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: order, error: fetchErr } = await (supabase.from("product_orders") as any)
      .select(
        `
        id,
        status,
        payment_status,
        customer_id,
        order_number,
        tenant_id,
        provider_id,
        total_amount,
        wallet_amount,
        gift_card_amount,
        payment_method,
        payment_reference,
        currency,
        collection_location_id,
        tracking_number,
        carrier,
        courier_shipment_id,
        fulfillment_type,
        estimated_delivery_date,
        provider:providers!inner ( id, business_name, tenant_id )
      `,
      )
      .eq("id", id)
      .eq("provider.tenant_id", tenantId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!order) return notFoundResponse("Order not found");

    const orderRow = order as {
      id: string;
      status: string;
      payment_status: string;
      customer_id?: string | null;
      order_number?: string | null;
      tenant_id?: string | null;
      provider_id: string;
      total_amount?: number | string | null;
      currency?: string | null;
      collection_location_id?: string | null;
      tracking_number?: string | null;
      carrier?: string | null;
      estimated_delivery_date?: string | null;
      provider?: { id?: string; business_name?: string; tenant_id?: string };
    };

    if (
      parsed.status &&
      TERMINAL_STATUSES.has(orderRow.status) &&
      parsed.status !== orderRow.status
    ) {
      return errorResponse(
        `Cannot change a ${orderRow.status} order.`,
        "INVALID_TRANSITION",
        400,
      );
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.status !== undefined) {
      updates.status = parsed.status;
      if (parsed.status === "cancelled") {
        updates.cancelled_at = new Date().toISOString();
        updates.cancellation_reason =
          parsed.cancellation_reason?.trim() ||
          parsed.admin_notes?.trim() ||
          "Cancelled by admin";
      }
      if (parsed.status === "refunded") {
        updates.payment_status = "refunded";
        updates.refunded_amount = Number(orderRow.total_amount ?? 0);
        updates.refunded_at = new Date().toISOString();
      }
    }
    if (parsed.payment_status !== undefined) updates.payment_status = parsed.payment_status;
    if (parsed.tracking_number !== undefined) updates.tracking_number = parsed.tracking_number;
    if (parsed.admin_notes !== undefined) updates.admin_notes = parsed.admin_notes;

    const { data, error } = await (supabase.from("product_orders") as any)
      .update(updates)
      .eq("id", id)
      .select(
        "id, status, payment_status, order_number, collection_location_id, tracking_number, carrier, estimated_delivery_date",
      )
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFoundResponse("Order not found");

    // Restock and cancel the courier shipment only once the cancel/refund is committed:
    // restocking is not idempotent, so running it before a wallet-failure rollback would
    // restock again when the refund is retried.
    // Restock, tender refunds and ledger reversal run only on the transition into a
    // terminal status; re-sending the current terminal status must not repeat them.
    const enteringTerminal =
      (parsed.status === "cancelled" || parsed.status === "refunded") &&
      parsed.status !== orderRow.status;

    const applyTerminalStockAndShipping = async () => {
      if (!enteringTerminal) return;
      await restockProductOrderLineItems(supabase, id, {
        movementType: parsed.status === "refunded" ? "return" : "cancel",
        actorUserId: user.id,
      });
      if (
        (orderRow as { fulfillment_type?: string }).fulfillment_type === "delivery" &&
        ((orderRow as { courier_shipment_id?: string | null }).courier_shipment_id ||
          orderRow.tracking_number)
      ) {
        try {
          await cancelCourierShipmentForOrder(supabase, id);
        } catch (cancelErr) {
          console.warn("Admin courier shipment cancel failed:", cancelErr);
        }
      }
    };

    const statusChanged = parsed.status != null && parsed.status !== orderRow.status;

    let onlineRefundedAmount = 0;
    let walletCreditIssued = 0;
    let walletFailedAfterTender = false;
    const refundAmount = Number(orderRow.total_amount ?? 0);
    if (
      enteringTerminal &&
      parsed.status === "refunded" &&
      orderRow.payment_status === "paid" &&
      orderRow.customer_id
    ) {
      const adminClient = getSupabaseAdmin();
      const tender = await splitProductOrderRefundTender(adminClient, orderRow, {
        refundAmount,
        reason: "Order refunded by admin",
        idempotencyKey: `product_order_refund_online:${id}`,
      });
      onlineRefundedAmount = tender.onlineRefundedAmount;
      if (tender.onlineRefundFailed) {
        console.warn(
          `[admin product-order refund] gateway refund failed for ${id}; wallet fallback`,
        );
      }
      if (tender.walletCreditAmount > 0) {
        const { error: walletError } = await (adminClient.rpc as any)("wallet_credit_admin", {
          p_user_id: orderRow.customer_id,
          p_amount: tender.walletCreditAmount,
          p_currency: orderRow.currency || LAST_RESORT_CURRENCY,
          p_description: `Refund for order ${orderRow.order_number || id.slice(0, 8)}`,
          p_reference_id: id,
          p_reference_type: "product_order_refund",
          p_tenant_id: orderRow.tenant_id ?? null,
          p_idempotency_key: `product_order_refund:${id}`,
        });
        if (!walletError) {
          walletCreditIssued = tender.walletCreditAmount;
        }
        if (walletError) {
          console.error(`[admin product-order refund] wallet credit failed for ${id}:`, walletError);
          if (tender.tenderMoved) {
            // Card / gift money already went back — keep the order refunded (restock and
            // ledger reversal still apply); the wallet leg needs manual reconciliation.
            walletFailedAfterTender = true;
          } else {
            await (supabase.from("product_orders") as any)
              .update({
                status: orderRow.status,
                payment_status: orderRow.payment_status,
                refunded_amount: null,
                refunded_at: null,
              })
              .eq("id", id);
            return errorResponse(
              "Could not credit the customer's wallet. The refund was not recorded.",
              "WALLET_CREDIT_FAILED",
              500,
            );
          }
        }
      }
    }

    await applyTerminalStockAndShipping();

    let cancelRefundWalletFailed = false;
    if (
      enteringTerminal &&
      (parsed.status === "refunded" ||
        (parsed.status === "cancelled" && orderRow.payment_status === "paid"))
    ) {
      const sideEffects = await applyProductOrderCancelRefundSideEffects(
        supabase,
        getSupabaseAdmin(),
        orderRow,
        {
          newStatus: parsed.status === "refunded" ? "refunded" : "cancelled",
          refundAmount,
          cancellationReason:
            parsed.cancellation_reason?.trim() ||
            parsed.admin_notes?.trim() ||
            "Cancelled by admin",
          onlineRefundedAmount,
          walletCreditIssued,
        },
      );
      cancelRefundWalletFailed = sideEffects.walletCreditFailed;
    } else if (
      enteringTerminal &&
      parsed.status === "cancelled" &&
      orderRow.payment_status !== "paid"
    ) {
      const released = await releaseUnpaidProductOrderHolds(
        getSupabaseAdmin(),
        order,
        `Wallet refund (order cancelled before payment) ${orderRow.order_number || id.slice(0, 8)}`,
      );
      cancelRefundWalletFailed = released.failed;
    }

    if (cancelRefundWalletFailed) {
      return errorResponse(
        "The order was cancelled, but the customer's wallet refund failed. Support will complete it — do not cancel again.",
        "REFUND_PENDING",
        502,
      );
    }

    if (walletFailedAfterTender) {
      return errorResponse(
        "The card or gift card portion was refunded, but the wallet credit failed. Support will reconcile the remaining amount.",
        "WALLET_CREDIT_FAILED_PARTIAL",
        500,
      );
    }

    if (
      statusChanged &&
      parsed.status &&
      orderRow.customer_id &&
      NOTIFY_STATUSES.has(parsed.status as ProductOrderNotifyStatus)
    ) {
      await dispatchProductOrderStatusNotification({
        supabase,
        customerId: orderRow.customer_id,
        status: parsed.status as ProductOrderNotifyStatus,
        orderId: id,
        orderNumber: String(orderRow.order_number ?? id.slice(0, 8)),
        tenantId: orderRow.tenant_id ?? orderRow.provider?.tenant_id ?? null,
        providerId: orderRow.provider_id,
        collectionLocationId:
          (data as { collection_location_id?: string | null }).collection_location_id ??
          orderRow.collection_location_id,
        cancellationReason:
          parsed.cancellation_reason?.trim() ||
          parsed.admin_notes?.trim() ||
          (parsed.status === "cancelled" ? "Cancelled by admin" : null),
        trackingNumber:
          parsed.tracking_number ??
          (data as { tracking_number?: string }).tracking_number ??
          orderRow.tracking_number,
        carrier: (data as { carrier?: string }).carrier ?? orderRow.carrier,
        trackingUrl:
          parsed.tracking_url ??
          (data as { tracking_url?: string | null }).tracking_url ??
          (orderRow as { tracking_url?: string | null }).tracking_url ??
          null,
        estimatedDelivery:
          (data as { estimated_delivery_date?: string }).estimated_delivery_date ??
          orderRow.estimated_delivery_date,
        refundAmount: parsed.status === "refunded" ? Number(orderRow.total_amount ?? 0) : null,
      });
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.product_order.update",
      entity_type: "product_order",
      entity_id: id,
      module: "ecommerce",
      risk_level: "high",
      retention_tier: "operational",
      metadata: updates,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse(data);
  } catch (err) {
    return handleApiError(err, "Failed to update product order");
  }
}
