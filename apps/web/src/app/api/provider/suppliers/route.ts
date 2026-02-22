import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/suppliers
 * 
 * Get provider's suppliers
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

    // Get unique suppliers from products
    const { data: products, error } = await supabase
      .from("products")
      .select("supplier")
      .eq("provider_id", providerId)
      .not("supplier", "is", null);

    if (error) {
      throw error;
    }

    // Extract unique suppliers
    const uniqueSuppliers = Array.from(
      new Set((products || []).map((p) => p.supplier).filter(Boolean))
    ).sort();

    return successResponse(uniqueSuppliers.map((supplier) => ({ name: supplier })));
  } catch (error) {
    return handleApiError(error, "Failed to fetch suppliers");
  }
}

/**
 * POST /api/provider/suppliers
 * 
 * Create a new supplier (just returns the name, suppliers are stored in products)
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
        new Error("Supplier name is required"),
        "VALIDATION_ERROR",
        400
      );
    }

    // Suppliers are just stored as text in products, so we just return success
    // The supplier will be created when a product with that supplier is saved
    return successResponse({ name: name.trim() });
  } catch (error) {
    return handleApiError(error, "Failed to create supplier");
  }
}
