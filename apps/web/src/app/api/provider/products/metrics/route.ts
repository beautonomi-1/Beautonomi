import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import {
  effectiveStockQuantity,
  retailStockValue,
} from "@/lib/provider-portal/product-inventory-metrics";

/**
 * GET /api/provider/products/metrics
 *
 * Get product inventory metrics (retail value = Σ qty × retail per SKU, including variants).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: products, error } = await supabase
      .from("products")
      .select("quantity, retail_price, low_stock_level, has_variants, track_stock_quantity, product_variants(quantity, retail_price)")
      .eq("provider_id", providerId)
      .eq("is_active", true);

    if (error) {
      throw error;
    }

    const productsArray = products || [];
    const totalProducts = productsArray.length;
    const lowStockProducts = productsArray.filter((p) => {
      if (p.track_stock_quantity === false) return false;
      const q = effectiveStockQuantity(p);
      return q > 0 && q <= (Number(p.low_stock_level) || 5);
    }).length;
    const outOfStockProducts = productsArray.filter((p) => {
      if (p.track_stock_quantity === false) return false;
      return effectiveStockQuantity(p) === 0;
    }).length;
    const totalInventoryValue = productsArray.reduce((sum, p) => sum + retailStockValue(p), 0);

    return successResponse({
      totalProducts,
      lowStockProducts,
      outOfStockProducts,
      totalInventoryValue,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch product metrics");
  }
}
