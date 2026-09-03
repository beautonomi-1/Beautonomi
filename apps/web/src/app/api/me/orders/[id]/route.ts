import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/orders/[id]
 * Get order detail with items, provider info, and delivery/collection details.
 * Uses admin client for the product_variants embed so deactivated products
 * don't break the entire query due to RLS restrictions.
 * @tenant-hint scoped by customer_id = user.id (authenticated user owns the order)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );

    const supabaseAdmin = getSupabaseAdmin();

    // Customer-audit 2026-04: the admin client is used to bypass RLS on
    // the deeply-embedded `product_variants` (deactivated variants were
    // breaking the whole query). Because the row is fetched without a
    // `customer_id` filter first, we still enforce ownership below and
    // return a distinct error when the order exists but belongs to
    // another account (prevents the opaque "Order not found" that users
    // got when their session silently changed account, e.g. after a
    // forced re-login from a different device).
    const { data: order, error } = await (supabaseAdmin.from("product_orders") as any)
      .select(
        `
        *,
        items:product_order_items (
          id, product_id, product_variant_id, product_name, product_image_url, quantity, unit_price, total_price,
          fulfilment_status, fulfilled_qty, fulfilment_updated_at,
          product_variant:product_variants (id, option_values)
        ),
        provider:providers (
          id, business_name, slug, thumbnail_url
        ),
        returns:product_return_requests (
          id, status, reason, description, refund_amount, created_at, updated_at,
          order_item_id, product_name, quantity, provider_notes,
          approved_at, rejected_at, item_received_at, refunded_at, escalated_at
        ),
        delivery_address:user_addresses (
          id, label, address_line1, address_line2, city, state, postal_code, country
        ),
        collection_location:provider_locations (
          id, name, address_line1, address_line2, city, state, postal_code, phone, working_hours
        ),
        customer:users!product_orders_customer_id_fkey (
          id, full_name, email, phone
        )
      `,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[me/orders/[id]] Supabase error:", error.message, error.code);
      return NextResponse.json(
        { error: "Failed to load order details. Please try again." },
        { status: 500 },
      );
    }

    if (!order) {
      return notFoundResponse("Order not found");
    }

    const orderOwnerId = (order as { customer_id?: string }).customer_id;
    if (orderOwnerId !== user.id && user.role !== "superadmin") {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "This order is not associated with your account.",
            code: "ORDER_OWNERSHIP_MISMATCH",
          },
        },
        { status: 403 },
      );
    }

    // DB column is `thumbnail_url`; web clients historically expect `logo_url` on provider.
    const rawProvider = (order as { provider?: { thumbnail_url?: string | null } | null }).provider;
    const orderOut = {
      ...order,
      provider: rawProvider
        ? {
            ...rawProvider,
            logo_url: rawProvider.thumbnail_url ?? null,
          }
        : null,
    };

    return successResponse({ order: orderOut });
  } catch (err) {
    return handleApiError(err, "Failed to fetch order");
  }
}
