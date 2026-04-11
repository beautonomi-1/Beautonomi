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

    const { data: order, error } = await (supabaseAdmin.from("product_orders") as any)
      .select(
        `
        *,
        items:product_order_items (
          id, product_id, product_variant_id, product_name, product_image_url, quantity, unit_price, total_price,
          product_variant:product_variants (id, option_values)
        ),
        provider:providers (
          id, business_name, slug, logo_url
        ),
        delivery_address:user_addresses (
          id, label, address_line1, address_line2, city, state, postal_code, country
        ),
        collection_location:provider_locations (
          id, name, address_line1, address_line2, city, state, postal_code, phone, working_hours
        )
      `,
      )
      .eq("id", id)
      .eq("customer_id", user.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return notFoundResponse("Order not found");
      }
      console.error("[me/orders/[id]] Supabase error:", error.message, error.code);
      return NextResponse.json(
        { error: "Failed to load order details. Please try again." },
        { status: 500 },
      );
    }

    if (!order) {
      return notFoundResponse("Order not found");
    }

    return successResponse({ order });
  } catch (err) {
    return handleApiError(err, "Failed to fetch order");
  }
}
