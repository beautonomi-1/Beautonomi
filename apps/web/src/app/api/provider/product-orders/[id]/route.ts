import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  status: z
    .enum([
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
  estimated_delivery_date: z.string().optional(),
  cancellation_reason: z.string().max(500).optional(),
});

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["ready_for_collection", "shipped", "cancelled"],
  ready_for_collection: ["delivered", "cancelled"],
  shipped: ["delivered"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

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
          id, product_id, product_name, product_image_url, quantity, unit_price, total_price
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
      .select("id, status, provider_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchErr || !order) {
      return notFoundResponse("Order not found");
    }

    // Validate status transition
    if (parsed.status) {
      const allowed = STATUS_TRANSITIONS[order.status] ?? [];
      if (!allowed.includes(parsed.status)) {
        return errorResponse(
          `Cannot transition from "${order.status}" to "${parsed.status}"`,
          "INVALID_TRANSITION",
          400,
        );
      }
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {};
    if (parsed.status) {
      updatePayload.status = parsed.status;
      if (parsed.status === "confirmed") updatePayload.confirmed_at = new Date().toISOString();
      if (parsed.status === "shipped") updatePayload.shipped_at = new Date().toISOString();
      if (parsed.status === "delivered") updatePayload.delivered_at = new Date().toISOString();
      if (parsed.status === "cancelled") {
        updatePayload.cancelled_at = new Date().toISOString();
        updatePayload.cancellation_reason = parsed.cancellation_reason ?? null;
      }
      if (parsed.status === "delivered" || parsed.status === "shipped") {
        updatePayload.payment_status = "paid";
      }
      if (parsed.status === "refunded") {
        updatePayload.payment_status = "refunded";
      }
    }
    if (parsed.tracking_number) updatePayload.tracking_number = parsed.tracking_number;
    if (parsed.estimated_delivery_date)
      updatePayload.estimated_delivery_date = parsed.estimated_delivery_date;

    // On cancellation, restore stock
    if (parsed.status === "cancelled") {
      const { data: items } = await (supabase.from("product_order_items") as any)
        .select("product_id, quantity")
        .eq("order_id", id);

      if (items) {
        for (const item of items) {
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

    const { data: updated, error: updateErr } = await (supabase.from("product_orders") as any)
      .update(updatePayload)
      .eq("id", id)
      .select("*, customer:users!product_orders_customer_id_fkey(id, full_name)")
      .single();

    if (updateErr) throw updateErr;

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
          message: `Your order ${updated.order_number} has been shipped.${parsed.tracking_number ? ` Tracking: ${parsed.tracking_number}` : ""}`,
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
      };

      const notif = notificationMap[parsed.status];
      if (notif) {
        await supabase.from("notifications").insert({
          user_id: updated.customer.id,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          metadata: {
            product_order_id: id,
            order_number: updated.order_number,
            status: parsed.status,
          },
          link: "/product-orders",
        }).then(() => {}, () => {});
      }
    }

    return successResponse({ order: updated });
  } catch (err) {
    return handleApiError(err, "Failed to update order");
  }
}
