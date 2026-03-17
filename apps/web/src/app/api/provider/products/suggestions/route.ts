import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
  requireRoleInApi,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/products/suggestions
 *
 * Returns distinct category, brand, and supplier values from the provider's
 * products for use in combobox/suggestion UIs (e.g. ChipCombobox fetchSuggestions).
 * Optional query: ?field=category|brand|supplier to return only one field.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff"],
      request
    );
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { searchParams } = new URL(request.url);
    const field = searchParams.get("field") as
      | "category"
      | "brand"
      | "supplier"
      | null;
    const query = searchParams.get("q") ?? "";

    const { data: products, error } = await supabase
      .from("products")
      .select("category, brand, supplier")
      .eq("provider_id", providerId);

    if (error) throw error;

    const raw = (products || []) as Array<{
      category?: string | null;
      brand?: string | null;
      supplier?: string | null;
    }>;

    const normalize = (s: string) => s.trim().toLowerCase();
    const filterByQuery = (arr: string[]) =>
      query.trim()
        ? arr.filter((v) => normalize(v).includes(normalize(query.trim())))
        : arr;

    const categories = filterByQuery(
      Array.from(
        new Set(
          raw.map((p) => p.category).filter((c): c is string => Boolean(c?.trim()))
        )
      ).sort()
    );
    const brands = filterByQuery(
      Array.from(
        new Set(
          raw.map((p) => p.brand).filter((b): b is string => Boolean(b?.trim()))
        )
      ).sort()
    );
    const suppliers = filterByQuery(
      Array.from(
        new Set(
          raw
            .map((p) => p.supplier)
            .filter((s): s is string => Boolean(s?.trim()))
        )
      ).sort()
    );

    if (field === "category") {
      return successResponse(
        categories.slice(0, 20).map((value) => ({ value, label: value }))
      );
    }
    if (field === "brand") {
      return successResponse(
        brands.slice(0, 20).map((value) => ({ value, label: value }))
      );
    }
    if (field === "supplier") {
      return successResponse(
        suppliers.slice(0, 20).map((value) => ({ value, label: value }))
      );
    }

    return successResponse({
      category: categories.slice(0, 20).map((value) => ({ value, label: value })),
      brand: brands.slice(0, 20).map((value) => ({ value, label: value })),
      supplier: suppliers.slice(0, 20).map((value) => ({ value, label: value })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch product suggestions");
  }
}
