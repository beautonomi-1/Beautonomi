import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/orders/[id]
 * Get order detail with items, provider info, and delivery/collection details
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
    const supabase = await getSupabaseServer();

    const { data: order, error } = await (supabase.from("product_orders") as any)
      .select(
        `
        *,
        items:product_order_items (
          id, product_id, product_name, product_image_url, quantity, unit_price, total_price
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

    if (error || !order) {
      return notFoundResponse("Order not found");
    }

    return successResponse({ order });
  } catch (err) {
    return handleApiError(err, "Failed to fetch order");
  }
}
