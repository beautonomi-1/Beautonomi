import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * GET /api/me/wishlists/products
 *
 * Get all saved products from all wishlists for the current user.
 */
export async function GET(request: NextRequest) {
  try {
    let user;
    try {
      const result = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
      user = result.user;
    } catch {
      return successResponse([]);
    }

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const fallbackCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const { data: wishlists, error: wlErr } = await (supabase.from("wishlists") as any)
      .select("id")
      .eq("user_id", user.id);
    if (wlErr || !wishlists?.length) return successResponse([]);

    const wishlistIds = wishlists.map((w: any) => w.id);
    const { data: wishlistItems, error: itemsErr } = await (supabase.from("wishlist_items") as any)
      .select("item_id, created_at")
      .in("wishlist_id", wishlistIds)
      .eq("item_type", "product")
      .order("created_at", { ascending: false });
    if (itemsErr || !wishlistItems?.length) return successResponse([]);

    const productIds = Array.from(new Set(wishlistItems.map((i: any) => i.item_id)));

    const { data: products, error: prodErr } = await (supabase.from("products") as any)
      .select("id, name, brand, retail_price, currency, image_urls, quantity, track_stock_quantity, has_variants, provider_id, is_active, retail_sales_enabled")
      .in("id", productIds)
      .eq("is_active", true)
      .eq("retail_sales_enabled", true);
    if (prodErr || !products?.length) return successResponse([]);

    const providerIds = Array.from(new Set((products ?? []).map((p: any) => p.provider_id).filter(Boolean)));
    const { data: providers } = await (supabase.from("providers") as any)
      .select("id, business_name, slug, thumbnail_url, avatar_url, tenant_id, status")
      .in("id", providerIds);
    type ProviderRow = {
      id: string;
      business_name: string;
      slug: string;
      thumbnail_url?: string | null;
      avatar_url?: string | null;
      tenant_id?: string | null;
      status?: string | null;
    };
    const providerMap = new Map<string, ProviderRow>(
      ((providers ?? []) as ProviderRow[]).map((p) => [p.id, p]),
    );

    const { data: variants } = await (supabase.from("product_variants") as any)
      .select("product_id, retail_price, quantity")
      .in("product_id", productIds);
    const variantsByProduct = new Map<string, Array<{ retail_price: number; quantity: number }>>();
    (variants ?? []).forEach((v: any) => {
      const arr = variantsByProduct.get(v.product_id) ?? [];
      arr.push({ retail_price: Number(v.retail_price) || 0, quantity: Number(v.quantity) || 0 });
      variantsByProduct.set(v.product_id, arr);
    });

    const addedAtMap = new Map(wishlistItems.map((item: any) => [item.item_id, item.created_at]));

    const mapped = (products ?? [])
      .map((p: any) => {
        const provider = providerMap.get(p.provider_id);
        if (!provider) return null;
        if (provider.tenant_id && provider.tenant_id !== tenantId) return null;
        if (provider.status === "suspended") return null;

        const productVariants = variantsByProduct.get(p.id) ?? [];
        const minVariantPrice =
          productVariants.length > 0 ? Math.min(...productVariants.map((v) => Number(v.retail_price) || 0)) : null;
        const variantStock = productVariants.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0);
        const inStock = p.has_variants
          ? variantStock > 0
          : !p.track_stock_quantity || Number(p.quantity || 0) > 0;

        return {
          id: p.id,
          name: p.name,
          brand: p.brand,
          image_urls: p.image_urls ?? [],
          retail_price: minVariantPrice != null && minVariantPrice > 0 ? minVariantPrice : Number(p.retail_price) || 0,
          currency: p.currency || fallbackCurrency,
          in_stock: inStock,
          added_at: addedAtMap.get(p.id) ?? new Date().toISOString(),
          provider: {
            id: provider.id,
            business_name: provider.business_name,
            slug: provider.slug,
            logo_url: provider.thumbnail_url ?? provider.avatar_url ?? null,
          },
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());

    return successResponse(mapped);
  } catch (error) {
    console.error("Unexpected error in GET /api/me/wishlists/products:", error);
    return successResponse([]);
  }
}

