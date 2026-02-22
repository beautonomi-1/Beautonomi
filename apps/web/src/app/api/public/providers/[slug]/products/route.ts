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

    // Get products available for retail sales
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, short_description, description, retail_price, image_url, image_urls, quantity, track_stock_quantity, currency")
      .eq("provider_id", provider.id)
      .eq("is_active", true)
      .eq("retail_sales_enabled", true)
      .order("name", { ascending: true });

    if (productsError) {
      console.error("Error fetching products:", productsError);
      return handleApiError(productsError, "Failed to fetch products");
    }

    // Transform products for frontend
    const transformedProducts = (products || []).map((product: any) => ({
      id: product.id,
      name: product.name,
      description: product.short_description || product.description || "",
      price: Number(product.retail_price || 0),
      currency: product.currency || "ZAR",
      imageUrl: product.image_url || (product.image_urls && product.image_urls.length > 0 ? product.image_urls[0] : null),
      inStock: product.track_stock_quantity ? (product.quantity || 0) > 0 : true,
      quantity: product.quantity || 0,
      track_stock_quantity: product.track_stock_quantity || false,
    }));

    return successResponse(transformedProducts);
  } catch (error) {
    return handleApiError(error, "Failed to fetch products");
  }
}
