import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const RETURN_WINDOW_DAYS = 14;

const createReturnSchema = z.object({
  order_id: z.string().uuid(),
  order_item_id: z.string().uuid().optional(),
  reason: z.enum([
    "damaged",
    "wrong_item",
    "not_as_described",
    "quality_issue",
    "changed_mind",
    "arrived_late",
    "other",
  ]),
  description: z.string().max(1000).optional(),
  image_urls: z.array(z.string().url()).max(5).optional(),
  quantity: z.number().int().min(1).optional(),
});

/**
 * GET /api/me/returns — list customer's return requests
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer();

    const { data, error } = await (supabase.from("product_return_requests") as any)
      .select(
        `*, order:product_orders(order_number, total_amount, provider:providers(id, business_name))`,
      )
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return successResponse({ returns: data ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to fetch return requests");
  }
}

/**
 * POST /api/me/returns — create a return request
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const body = await request.json();
    const parsed = createReturnSchema.parse(body);
    const supabase = await getSupabaseServer();

    // Validate order belongs to customer and is delivered
    const { data: order, error: orderErr } = await (supabase.from("product_orders") as any)
      .select("id, customer_id, provider_id, status, delivered_at, created_at")
      .eq("id", parsed.order_id)
      .eq("customer_id", user.id)
      .single();

    if (orderErr || !order) {
      return errorResponse("Order not found", "NOT_FOUND", 404);
    }
    if (!["delivered", "ready_for_collection"].includes(order.status)) {
      return errorResponse(
        "Returns can only be requested for delivered orders",
        "INVALID_STATUS",
        400,
      );
    }

    // Check return window
    const deliveredDate = new Date(order.delivered_at || order.created_at);
    const daysSinceDelivery =
      (Date.now() - deliveredDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDelivery > RETURN_WINDOW_DAYS) {
      return errorResponse(
        `Return window of ${RETURN_WINDOW_DAYS} days has expired`,
        "WINDOW_EXPIRED",
        400,
      );
    }

    // Check for existing pending return on same order
    const { data: existing } = await (supabase.from("product_return_requests") as any)
      .select("id")
      .eq("order_id", parsed.order_id)
      .eq("customer_id", user.id)
      .in("status", ["pending", "approved", "item_received"])
      .maybeSingle();

    if (existing) {
      return errorResponse(
        "You already have an active return request for this order",
        "DUPLICATE",
        409,
      );
    }

    // Get order item details for snapshot
    let productName = "Product";
    let refundAmount = 0;
    let qty = parsed.quantity ?? 1;

    if (parsed.order_item_id) {
      const { data: item } = await (supabase.from("product_order_items") as any)
        .select("product_name, quantity, unit_price, total_price")
        .eq("id", parsed.order_item_id)
        .eq("order_id", parsed.order_id)
        .single();
      if (item) {
        productName = item.product_name;
        qty = Math.min(qty, item.quantity);
        refundAmount = item.unit_price * qty;
      }
    } else {
      // Full order return
      const { data: items } = await (supabase.from("product_order_items") as any)
        .select("product_name, total_price")
        .eq("order_id", parsed.order_id);
      productName = (items ?? []).map((i: any) => i.product_name).join(", ");
      refundAmount = (items ?? []).reduce((s: number, i: any) => s + Number(i.total_price), 0);
    }

    const { data: returnReq, error: createErr } = await (
      supabase.from("product_return_requests") as any
    )
      .insert({
        order_id: parsed.order_id,
        order_item_id: parsed.order_item_id ?? null,
        customer_id: user.id,
        provider_id: order.provider_id,
        reason: parsed.reason,
        description: parsed.description ?? null,
        image_urls: parsed.image_urls ?? [],
        product_name: productName,
        quantity: qty,
        refund_amount: refundAmount.toFixed(2),
      })
      .select()
      .single();

    if (createErr) throw createErr;

    // Notify provider of return request
    const { data: provider } = await (supabase.from("providers") as any)
      .select("owner_id")
      .eq("id", order.provider_id)
      .single();

    if (provider?.owner_id) {
      const { data: userData } = await supabase.from("users").select("full_name").eq("id", user.id).single();
      await supabase.from("notifications").insert({
        user_id: provider.owner_id,
        type: "product_return_requested",
        title: "Return Request",
        message: `${userData?.full_name ?? "A customer"} has requested a return for an item worth R${refundAmount.toFixed(2)}`,
        metadata: {
          return_request_id: returnReq.id,
          order_id: parsed.order_id,
          reason: parsed.reason,
        },
        link: "/provider/ecommerce/returns",
      }).then(() => {}, () => {});
    }

    return successResponse({ return_request: returnReq }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create return request");
  }
}
