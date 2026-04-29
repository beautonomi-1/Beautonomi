import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { transformPublicProduct } from "@/lib/public-products/transform-public-product";

/**
 * GET /api/public/providers/[slug]/products
 * 
 * Get products available for booking (retail_sales_enabled = true)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) return tenantRes;
    const { tenantId } = tenantRes;
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const defaultCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const supabase = getSupabaseAdmin();
    const rawSlug = (await params).slug;
    let slug: string;
    try { slug = decodeURIComponent(rawSlug); } catch { slug = rawSlug; }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

    // Use admin client to bypass RLS — consistent with the SSR profile loader
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq(isUuid ? "id" : "slug", slug)
      .maybeSingle();

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // Get products available for retail sales (include has_variants).
    // Currency: use tenant default below; optional `products.currency` exists after migration 387_products_currency.sql.
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, short_description, description, retail_price, image_urls, quantity, track_stock_quantity, has_variants, variant_option_types, category")
      .eq("provider_id", provider.id)
      .eq("is_active", true)
      .eq("retail_sales_enabled", true)
      .order("name", { ascending: true });

    if (productsError) {
      console.error("Error fetching products:", productsError);
      return handleApiError(productsError, "Failed to fetch products");
    }

    const productIds = (products || []).map((p: any) => p.id);
    const variantsByProduct: Record<string, any[]> = {};
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

    // §Release-audit 2026-04: variant pricing + stock must agree with
    // validate-booking. The transform is pulled into a shared pure helper
    // (`transformPublicProduct`) so the route + the regression tests exercise
    // the same implementation. See that module's header comment for the full
    // rationale.
    const transformedProducts = (products || []).map((product: any) =>
      transformPublicProduct(product, variantsByProduct[product.id], defaultCurrency),
    );

    const res = successResponse(transformedProducts);
    res.headers.set("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    return res;
  } catch (error) {
    return handleApiError(error, "Failed to fetch products");
  }
}
