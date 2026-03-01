import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/products/[id]
 * Product detail with reviews summary, provider info, and shipping config
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await getSupabaseServer();

    const { data: product, error } = await (supabase.from("products") as any)
      .select(
        `
        id, name, slug, brand, category, short_description, long_description, description,
        retail_price, supply_price, currency, image_urls, quantity, tags, measure, amount,
        tax_rate, weight_grams, is_active, retail_sales_enabled, created_at,
        provider:providers (
          id, business_name, slug, logo_url, description
        )
      `,
      )
      .eq("id", id)
      .eq("is_active", true)
      .eq("retail_sales_enabled", true)
      .single();

    if (error || !product) {
      return notFoundResponse("Product not found");
    }

    // Get reviews summary
    const { data: reviewStats } = await (supabase.from("product_reviews") as any)
      .select("rating")
      .eq("product_id", id)
      .eq("is_visible", true);

    const reviews = reviewStats ?? [];
    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
        : 0;

    // Get recent reviews
    const { data: recentReviews } = await (supabase.from("product_reviews") as any)
      .select(
        `
        id, rating, title, comment, image_urls, is_verified_purchase,
        helpful_count, provider_response, provider_response_at, created_at,
        customer:users!product_reviews_customer_id_fkey (
          id, full_name, avatar_url
        )
      `,
      )
      .eq("product_id", id)
      .eq("is_visible", true)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get shipping config for this provider
    const { data: shippingConfig } = await (supabase.from("provider_shipping_config") as any)
      .select("*")
      .eq("provider_id", product.provider.id)
      .maybeSingle();

    // Get collection locations
    const { data: locations } = await (supabase.from("provider_locations") as any)
      .select("id, name, address_line1, city, state, working_hours")
      .eq("provider_id", product.provider.id)
      .eq("is_active", true);

    // Related products from the same provider
    const { data: related } = await (supabase.from("products") as any)
      .select("id, name, slug, retail_price, image_urls, brand, category")
      .eq("provider_id", product.provider.id)
      .eq("is_active", true)
      .eq("retail_sales_enabled", true)
      .neq("id", id)
      .gt("quantity", 0)
      .limit(8);

    return successResponse({
      product,
      reviews: {
        average_rating: Math.round(avgRating * 10) / 10,
        total_count: reviews.length,
        recent: recentReviews ?? [],
      },
      shipping: shippingConfig ?? { offers_delivery: false, offers_collection: true },
      collection_locations: locations ?? [],
      related_products: related ?? [],
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch product");
  }
}
