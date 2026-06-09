import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

const PRODUCT_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "ready_for_collection",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

/**
 * GET /api/provider/product-orders
 * List product orders for the provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const bookingId = searchParams.get("booking_id")?.trim();
    const offset = (page - 1) * limit;

    // Includes order_source, fulfillment_type, payment_method for appointment-linked
    // fulfillment UI on booking detail (collection vs delivery routing).
    let query = (supabase.from("product_orders") as any)
      .select(
        `
        *,
        items:product_order_items (
          id, product_id, product_variant_id, product_name, product_image_url, quantity, unit_price, total_price,
          product_variant:product_variants(id, option_values)
        ),
        customer:users!product_orders_customer_id_fkey (
          id, full_name, email, avatar_url, identity_verified
        )
      `,
        { count: "exact" },
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }
    if (bookingId) {
      query = query.eq("booking_id", bookingId);
    }

    const { data: orders, error, count } = await query;
    if (error) throw error;

    const statusCountResults = await Promise.all([
      (supabase.from("product_orders") as any)
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .match(bookingId ? { booking_id: bookingId } : {}),
      ...PRODUCT_ORDER_STATUSES.map((orderStatus) =>
        (supabase.from("product_orders") as any)
          .select("id", { count: "exact", head: true })
          .eq("provider_id", providerId)
          .eq("status", orderStatus)
          .match(bookingId ? { booking_id: bookingId } : {}),
      ),
    ]);

    for (const result of statusCountResults) {
      if (result.error) throw result.error;
    }

    const statusCounts = PRODUCT_ORDER_STATUSES.reduce<Record<string, number>>(
      (acc, orderStatus, index) => {
        acc[orderStatus] = statusCountResults[index + 1]?.count ?? 0;
        return acc;
      },
      {},
    );

    return successResponse({
      orders: orders ?? [],
      status_counts: statusCounts,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalAll: statusCountResults[0]?.count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch product orders");
  }
}
