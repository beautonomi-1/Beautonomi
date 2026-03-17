import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/products/by-barcode
 * Look up a product or variant by barcode or SKU for the current provider.
 * Query: barcode=... or sku=... (barcode takes precedence if both provided).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const barcode = searchParams.get("barcode")?.trim();
    const sku = searchParams.get("sku")?.trim();

    if (!barcode && !sku) {
      return errorResponse("Query parameter 'barcode' or 'sku' is required", "VALIDATION_ERROR", 400);
    }

    // Prefer barcode lookup first
    if (barcode) {
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, name, barcode, sku, quantity, retail_price, image_urls, has_variants")
        .eq("provider_id", providerId)
        .eq("barcode", barcode)
        .eq("is_active", true)
        .maybeSingle();

      if (!productError && product) {
        if (product.has_variants) {
          const { data: variant } = await supabase
            .from("product_variants")
            .select("id, option_values, sku, barcode, quantity, retail_price")
            .eq("product_id", product.id)
            .eq("barcode", barcode)
            .maybeSingle();
          return successResponse({ product, variant: variant ?? undefined });
        }
        return successResponse({ product, variant: undefined });
      }

      const { data: variantRow, error: variantError } = await supabase
        .from("product_variants")
        .select("id, product_id, option_values, sku, barcode, quantity, retail_price")
        .eq("barcode", barcode)
        .maybeSingle();

      if (!variantError && variantRow) {
        const { data: product } = await supabase
          .from("products")
          .select("id, name, barcode, sku, image_urls, has_variants")
          .eq("id", variantRow.product_id)
          .eq("provider_id", providerId)
          .eq("is_active", true)
          .single();
        if (product) return successResponse({ product, variant: variantRow });
      }
    }

    if (sku) {
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, name, barcode, sku, quantity, retail_price, image_urls, has_variants")
        .eq("provider_id", providerId)
        .eq("sku", sku)
        .eq("is_active", true)
        .maybeSingle();

      if (!productError && product) {
        if (product.has_variants) {
          const { data: variant } = await supabase
            .from("product_variants")
            .select("id, option_values, sku, barcode, quantity, retail_price")
            .eq("product_id", product.id)
            .eq("sku", sku)
            .maybeSingle();
          return successResponse({ product, variant: variant ?? undefined });
        }
        return successResponse({ product, variant: undefined });
      }

      const { data: variantRow, error: variantError } = await supabase
        .from("product_variants")
        .select("id, product_id, option_values, sku, barcode, quantity, retail_price")
        .eq("sku", sku)
        .maybeSingle();

      if (!variantError && variantRow) {
        const { data: product } = await supabase
          .from("products")
          .select("id, name, barcode, sku, image_urls, has_variants")
          .eq("id", variantRow.product_id)
          .eq("provider_id", providerId)
          .eq("is_active", true)
          .single();
        if (product) return successResponse({ product, variant: variantRow });
      }
    }

    return notFoundResponse("No product found for this barcode or SKU");
  } catch (error) {
    return handleApiError(error, "Failed to look up product by barcode");
  }
}
