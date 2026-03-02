import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/providers/[slug]/products
 * 
 * Get products available for booking (retail_sales_enabled = true)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = await getSupabaseServer();
    const { slug } = params;

    // Get provider by slug
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id, status")
      .eq("slug", slug)
      .eq("status", "active")
      .single();

    if (providerError || !provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    // Get products available for retail sales (include has_variants)
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, short_description, description, retail_price, image_url, image_urls, quantity, track_stock_quantity, currency, has_variants, variant_option_types")
      .eq("provider_id", provider.id)
      .eq("is_active", true)
      .eq("retail_sales_enabled", true)
      .order("name", { ascending: true });

    if (productsError) {
      console.error("Error fetching products:", productsError);
      return handleApiError(productsError, "Failed to fetch products");
    }

    const productIds = (products || []).map((p: any) => p.id);
    let variantsByProduct: Record<string, any[]> = {};
    if (productIds.length > 0) {
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, product_id, option_values, sort_order, retail_price, quantity, sku")
        .in("product_id", productIds)
        .order("sort_order");
      (variants || []).forEach((v: any) => {
        if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
        variantsByProduct[v.product_id].push(v);
      });
    }

    // Transform products for frontend
    const transformedProducts = (products || []).map((product: any) => {
      const withVariants = Boolean(product.has_variants) && Array.isArray(variantsByProduct[product.id]) && variantsByProduct[product.id].length > 0;
      const variantList = withVariants ? variantsByProduct[product.id].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : [];
      const minPrice = withVariants && variantList.length ? Math.min(...variantList.map((v: any) => Number(v.retail_price || 0))) : Number(product.retail_price || 0);
      const inStock = withVariants ? variantList.some((v: any) => (v.quantity || 0) > 0) : (product.track_stock_quantity ? (product.quantity || 0) > 0 : true);
      const totalQty = withVariants ? variantList.reduce((s: number, v: any) => s + (v.quantity || 0), 0) : (product.quantity || 0);
      return {
        id: product.id,
        name: product.name,
        description: product.short_description || product.description || "",
        price: minPrice,
        currency: product.currency || "ZAR",
        imageUrl: product.image_url || (product.image_urls && product.image_urls.length > 0 ? product.image_urls[0] : null),
        inStock,
        quantity: totalQty,
        track_stock_quantity: product.track_stock_quantity || false,
        hasVariants: withVariants,
        variantOptionTypes: product.variant_option_types || [],
        variants: variantList.map((v: any) => ({ id: v.id, option_values: v.option_values, retail_price: Number(v.retail_price || 0), quantity: v.quantity || 0 })),
      };
    });

    return successResponse(transformedProducts);
  } catch (error) {
    return handleApiError(error, "Failed to fetch products");
  }
}
