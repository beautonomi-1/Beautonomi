import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/products/metrics
 * 
 * Get product inventory metrics
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

    // Get all products for metrics (not paginated); include variants for aggregate stock when has_variants
    const { data: products, error } = await supabase
      .from("products")
      .select("quantity, retail_price, low_stock_level, has_variants, product_variants(quantity)")
      .eq("provider_id", providerId)
      .eq("is_active", true);

    if (error) {
      throw error;
    }

    const productsArray = products || [];
    const stockQty = (p: (typeof productsArray)[number]) => {
      if (p.has_variants && Array.isArray(p.product_variants) && p.product_variants.length > 0) {
        return p.product_variants.reduce((s, v) => s + (Number((v as { quantity?: number }).quantity) || 0), 0);
      }
      return Number(p.quantity) || 0;
    };
    const totalProducts = productsArray.length;
    const lowStockProducts = productsArray.filter(
      (p) => {
        const q = stockQty(p);
        return q > 0 && q <= (p.low_stock_level || 5);
      }
    ).length;
    const outOfStockProducts = productsArray.filter((p) => stockQty(p) === 0).length;
    const totalInventoryValue = productsArray.reduce(
      (sum, p) => sum + (Number(p.retail_price || 0) * stockQty(p)),
      0
    );

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
