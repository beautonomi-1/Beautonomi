import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAdminSection,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

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
