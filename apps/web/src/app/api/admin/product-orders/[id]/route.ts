import { NextRequest } from "next/server";
import { z } from "zod";
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
  restockProductOrderLineItems,
} from "@/lib/orders/product-order-lifecycle";
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
        currency,
        collection_location_id,
        tracking_number,
        carrier,
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

    if (parsed.status === "cancelled" || parsed.status === "refunded") {
      await restockProductOrderLineItems(supabase, id);
    }

    const { data, error } = await (supabase.from("product_orders") as any)
      .update(updates)
      .eq("id", id)
      .select(
        "id, status, payment_status, order_number, collection_location_id, tracking_number, carrier, estimated_delivery_date",
      )
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFoundResponse("Order not found");

    const statusChanged = parsed.status != null && parsed.status !== orderRow.status;

    if (
      parsed.status === "refunded" &&
      orderRow.payment_status === "paid" &&
      orderRow.customer_id
    ) {
      const adminClient = getSupabaseAdmin();
      const refundAmount = Number(orderRow.total_amount ?? 0);
      await (adminClient.rpc as any)("wallet_credit_admin", {
        p_user_id: orderRow.customer_id,
        p_amount: refundAmount,
        p_currency: orderRow.currency || LAST_RESORT_CURRENCY,
        p_description: `Refund for order ${orderRow.order_number || id.slice(0, 8)}`,
        p_reference_id: id,
        p_reference_type: "product_order_refund",
        p_tenant_id: orderRow.tenant_id ?? null,
        p_idempotency_key: `product_order_refund:${id}`,
      });
    }

    if (
      parsed.status === "refunded" ||
      (parsed.status === "cancelled" && orderRow.payment_status === "paid")
    ) {
      await applyProductOrderCancelRefundSideEffects(
        supabase,
        getSupabaseAdmin(),
        orderRow,
        {
          newStatus: parsed.status === "refunded" ? "refunded" : "cancelled",
          refundAmount: Number(orderRow.total_amount ?? 0),
          cancellationReason:
            parsed.cancellation_reason?.trim() ||
            parsed.admin_notes?.trim() ||
            "Cancelled by admin",
        },
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
