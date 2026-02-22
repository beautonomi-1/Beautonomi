import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/brands
 * 
 * Get provider's brands
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

    // Get unique brands from products
    const { data: products, error } = await supabase
      .from("products")
      .select("brand")
      .eq("provider_id", providerId)
      .not("brand", "is", null);

    if (error) {
      throw error;
    }

    // Extract unique brands
    const uniqueBrands = Array.from(
      new Set((products || []).map((p) => p.brand).filter(Boolean))
    ).sort();

    return successResponse(uniqueBrands.map((brand) => ({ name: brand })));
  } catch (error) {
    return handleApiError(error, "Failed to fetch brands");
  }
}

/**
 * POST /api/provider/brands
 * 
 * Create a new brand (just returns the name, brands are stored in products)
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission('edit_products', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return handleApiError(
        new Error("Brand name is required"),
        "VALIDATION_ERROR",
        400
      );
    }

    // Brands are just stored as text in products, so we just return success
    // The brand will be created when a product with that brand is saved
    return successResponse({ name: name.trim() });
  } catch (error) {
    return handleApiError(error, "Failed to create brand");
  }
}
