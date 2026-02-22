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

    // Get all products for metrics (not paginated)
    const { data: products, error } = await supabase
      .from("products")
      .select("quantity, retail_price, low_stock_level")
      .eq("provider_id", providerId)
      .eq("is_active", true);

    if (error) {
      throw error;
    }

    const productsArray = products || [];
    const totalProducts = productsArray.length;
    const lowStockProducts = productsArray.filter(
      (p) => p.quantity > 0 && p.quantity <= (p.low_stock_level || 5)
    ).length;
    const outOfStockProducts = productsArray.filter((p) => (p.quantity || 0) === 0).length;
    const totalInventoryValue = productsArray.reduce(
      (sum, p) => sum + (Number(p.retail_price || 0) * (p.quantity || 0)),
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
