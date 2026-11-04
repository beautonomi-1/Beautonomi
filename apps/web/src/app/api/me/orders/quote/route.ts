import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import {
  collectProductOrderStockIssues,
  computeProductOrderTotals,
} from "@/lib/orders/compute-product-order-totals";

const quoteSchema = z.object({
  provider_id: z.string().uuid(),
  fulfillment_type: z.enum(["collection", "delivery"]),
  delivery_address_id: z.string().uuid().optional(),
  collection_location_id: z.string().uuid().optional(),
  promotion_code: z.string().trim().min(1).max(64).optional(),
  online_checkout: z.boolean().optional(),
});

/**
 * POST /api/me/orders/quote
 * Preview product-order totals from the current cart (same math as POST /api/me/orders).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const parsed = quoteSchema.parse(await request.json());

    const { data: providerRow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", parsed.provider_id)
      .maybeSingle();
    const orderTenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    if (!orderTenantId || orderTenantId !== tenantId) {
      return errorResponse("Provider not available in this market", "TENANT_MISMATCH", 404);
    }

    const { data: cartItems, error: cartErr } = await (supabase.from("cart_items") as any)
      .select(
        `
        id, quantity, product_variant_id,
        product:products!inner (
          id, name, retail_price, tax_rate, image_urls, weight_grams,
          is_active, retail_sales_enabled, quantity, track_stock_quantity, has_variants
        ),
        product_variant:product_variants (
          id, retail_price, quantity
        )
      `,
      )
      .eq("user_id", user.id)
      .eq("provider_id", parsed.provider_id);

    if (cartErr) throw cartErr;
    if (!cartItems?.length) {
      return errorResponse("No cart items found for this provider", "EMPTY_CART", 400);
    }

    const result = await computeProductOrderTotals(supabase, {
      cartItems: cartItems as any,
      providerId: parsed.provider_id,
      tenantId,
      customerId: user.id,
      fulfillmentType: parsed.fulfillment_type,
      deliveryAddressId: parsed.delivery_address_id ?? null,
      collectionLocationId: parsed.collection_location_id ?? null,
      promotionCode: parsed.promotion_code ?? null,
      onlineCheckout: parsed.online_checkout,
    });

    if (result.ok === false) {
      return errorResponse(result.message, result.code, 400);
    }

    // Non-blocking: the customer's own stale pending order may still hold stock until checkout cancels it.
    const stockWarnings = collectProductOrderStockIssues(cartItems as any);

    return successResponse({ totals: result.totals, stock_warnings: stockWarnings });
  } catch (error) {
    return handleApiError(error, "Failed to quote order");
  }
}
