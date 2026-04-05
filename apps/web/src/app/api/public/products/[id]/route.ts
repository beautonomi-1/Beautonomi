import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";

/** DB has thumbnail_url / avatar_url; API exposes logo_url for web + mobile clients. */
function toPublicProvider(provider: Record<string, unknown> | null) {
  if (!provider) return null;
  const thumbnail = provider.thumbnail_url as string | null | undefined;
  const avatar = provider.avatar_url as string | null | undefined;
  const { tenant_id: _tid, status: _st, thumbnail_url: _tn, avatar_url: _av, ...rest } = provider;
  return {
    ...rest,
    logo_url: thumbnail ?? avatar ?? null,
  };
}

/**
 * GET /api/public/products/[id]
 * Public product detail — uses admin client to bypass provider RLS.
 * Provider status check: only blocks 'suspended' to match the products list (which has no status filter).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) return tenantRes;

    const { id } = await params;
    // Use the admin client so that RLS on `providers` and other tables
    // does not block this public read. The tenant check below still scopes the result.
    const supabase = getSupabaseAdmin();

    const { data: product, error } = await (supabase.from("products") as any)
      .select(
        `
        id, name, slug, brand, category, short_description, long_description, description,
        retail_price, currency, image_urls, quantity, tags, measure, amount,
        tax_rate, weight_grams, is_active, retail_sales_enabled, created_at,
        has_variants, variant_option_types, track_stock_quantity, provider_id,
        provider:providers (
          id, business_name, slug, thumbnail_url, avatar_url, description, tenant_id, status
        )
      `,
      )
      .eq("id", id)
      .eq("is_active", true)
      .eq("retail_sales_enabled", true)
      .single();

    if (error || !product) {
      console.error("[product detail] product query failed", { id, error: error?.message, code: error?.code });
      return notFoundResponse("Product not found");
    }

    // The provider join may return null if RLS blocks it on this request context.
    // Fall back to a direct providers query in that case so we can still validate tenant.
    let provider = product.provider as Record<string, unknown> | null;
    if (!provider && (product as any).provider_id) {
      const { data: fallbackProvider } = await (supabase.from("providers") as any)
        .select("id, business_name, slug, thumbnail_url, avatar_url, description, tenant_id, status")
        .eq("id", (product as any).provider_id)
        .maybeSingle();
      provider = fallbackProvider ?? null;
    }

    if (!provider) {
      console.error("[product detail] provider not found", { provider_id: (product as any).provider_id });
      return notFoundResponse("Product not found");
    }
    // Only block suspended providers — draft/pending_approval still have active products
    // that are visible in the shop list (which has no provider status filter).
    if (provider.status === "suspended") {
      console.warn("[product detail] provider suspended", { provider_id: provider.id });
      return notFoundResponse("Product not found");
    }
    // Tenant check: only enforce when the provider explicitly has a tenant_id AND it differs
    // from the resolved tenant. This mirrors the products list endpoint which has no tenant filter,
    // so products visible in the shop list remain accessible on the detail page.
    if (provider.tenant_id && tenantRes.tenantId && provider.tenant_id !== tenantRes.tenantId) {
      console.warn("[product detail] tenant mismatch", { provider_tenant: provider.tenant_id, resolved: tenantRes.tenantId });
      return notFoundResponse("Product not found");
    }

    (product as any).provider = toPublicProvider(provider);

    // Normalize variant_option_types: stored as text/jsonb string in some environments
    if (typeof (product as any).variant_option_types === "string") {
      try {
        (product as any).variant_option_types = JSON.parse((product as any).variant_option_types);
      } catch {
        (product as any).variant_option_types = [];
      }
    }

    if (product.has_variants) {
      const { data: variants } = await (supabase.from("product_variants") as any)
        .select("id, product_id, option_values, sort_order, retail_price, quantity, sku, image_url")
        .eq("product_id", id)
        .order("sort_order");
      // Normalize option_values: stored as text/jsonb string in some environments
      const normalized = (variants || []).map((v: any) => ({
        ...v,
        option_values:
          typeof v.option_values === "string"
            ? (() => { try { return JSON.parse(v.option_values); } catch { return {}; } })()
            : (v.option_values ?? {}),
      }));
      (product as any).variants = normalized.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    } else {
      (product as any).variants = [];
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

    // Get collection locations (with backward-compatible fallback for legacy DBs
    // where provider_locations.location_type does not exist yet).
    let locations: any[] = [];
    const { data: typedLocations, error: typedLocationsError } = await (supabase
      .from("provider_locations") as any)
      .select("id, name, address_line1, city, state, working_hours")
      .eq("provider_id", product.provider.id)
      .eq("is_active", true)
      .eq("location_type", "salon")
      .order("is_primary", { ascending: false });
    if (typedLocationsError?.code === "42703") {
      const { data: legacyLocations, error: legacyLocationsError } = await (supabase
        .from("provider_locations") as any)
        .select("id, name, address_line1, city, state, working_hours")
        .eq("provider_id", product.provider.id)
        .eq("is_active", true)
        .order("is_primary", { ascending: false });
      if (legacyLocationsError) throw legacyLocationsError;
      locations = legacyLocations ?? [];
    } else {
      if (typedLocationsError) throw typedLocationsError;
      locations = typedLocations ?? [];
    }

    // Related products from the same provider (include variant-only stock: filter in JS)
    const { data: relatedRaw } = await (supabase.from("products") as any)
      .select(
        "id, name, slug, retail_price, image_urls, brand, category, quantity, track_stock_quantity, has_variants",
      )
      .eq("provider_id", product.provider.id)
      .eq("is_active", true)
      .eq("retail_sales_enabled", true)
      .neq("id", id)
      .limit(24);

    const sellable = (row: any) => {
      if (row.has_variants) return true;
      if (!row.track_stock_quantity) return true;
      return (row.quantity || 0) > 0;
    };
    const related = (relatedRaw ?? []).filter(sellable).slice(0, 8);

    return successResponse({
      product,
      reviews: {
        average_rating: Math.round(avgRating * 10) / 10,
        total_count: reviews.length,
        recent: recentReviews ?? [],
      },
      shipping: shippingConfig ?? { offers_delivery: false, offers_collection: true },
      collection_locations: locations ?? [],
      related_products: related,
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch product");
  }
}
