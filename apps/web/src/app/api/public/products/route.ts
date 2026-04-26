import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { haversineDistanceKmFromCoords } from "@/lib/geo/distance";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  transformPublicProduct,
  type RawProductRow,
  type RawProductVariantRow,
} from "@/lib/public-products/transform-public-product";

/**
 * GET /api/public/products
 * Browse all retail-enabled products across providers.
 * Query params: search, category, provider_id, tags, sort, page, limit
 */
export async function GET(request: NextRequest) {
  try {
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) return tenantRes;
    const { tenantId } = tenantRes;
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const defaultCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const providerId = searchParams.get("provider_id");
    const tags = searchParams.get("tags");
    const sort = searchParams.get("sort") || "newest";
    const latParam = Number(searchParams.get("lat"));
    const lngParam = Number(searchParams.get("lng"));
    const hasUserCoords = Number.isFinite(latParam) && Number.isFinite(lngParam);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "24"), 50);
    const offset = (page - 1) * limit;

    // §Release-audit 2026-04: include `has_variants` and
    // `track_stock_quantity` so product cards can render "Sold out"
    // badges using the same rule the mobile PDP already uses (see
    // CUSTOMER_MOBILE_COMPLETION_AUDIT): non-variant + stock-tracked
    // products are sold out when `quantity <= 0`. Without these flags
    // the list can't distinguish "stock not tracked" (always sellable)
    // from "stock tracked, 0 left" (sold out).
    let query = (supabase.from("products") as any)
      .select(
        `
        id, name, slug, brand, category, retail_price, image_urls, short_description,
        quantity, tags, created_at, has_variants, track_stock_quantity, variant_option_types,
        provider:providers (
          id, business_name, slug, thumbnail_url, avatar_url
        )
      `,
        { count: "exact" },
      )
      .eq("is_active", true)
      .eq("retail_sales_enabled", true);

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,brand.ilike.%${search}%,short_description.ilike.%${search}%`,
      );
    }
    if (category) {
      query = query.eq("category", category);
    }
    if (providerId) {
      query = query.eq("provider_id", providerId);
    }
    if (tags) {
      const tagList = tags.split(",").map((t) => t.trim());
      query = query.overlaps("tags", tagList);
    }

    switch (sort) {
      case "nearest":
        query = query.order("created_at", { ascending: false });
        break;
      case "price_asc":
        query = query.order("retail_price", { ascending: true });
        break;
      case "price_desc":
        query = query.order("retail_price", { ascending: false });
        break;
      case "name":
        query = query.order("name", { ascending: true });
        break;
      case "newest":
      default:
        query = query.order("created_at", { ascending: false });
        break;
    }

    query = query.range(offset, offset + limit - 1);

    const { data: products, error, count } = await query;
    if (error) {
      console.error("[GET /api/public/products] Supabase error:", error.message, error.details);
      return successResponse({
        products: [],
        categories: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      });
    }

    // Get distinct categories for filter chips (non-blocking: ignore errors)
    let uniqueCategories: string[] = [];
    try {
      const { data: categories } = await (supabase.from("products") as any)
        .select("category")
        .eq("is_active", true)
        .eq("retail_sales_enabled", true)
        .not("category", "is", null)
        .limit(50);
      const categoryList = (categories ?? []) as Array<{ category?: string }>;
      const categoryStrings = categoryList.map((c) => c.category).filter((x): x is string => Boolean(x));
      uniqueCategories = [...new Set(categoryStrings)];
    } catch {
      // keep uniqueCategories []
    }

    const productIds = [
      ...new Set(
        (products ?? [])
          .map((p: Record<string, unknown>) => p.id)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const variantsByProduct = new Map<string, RawProductVariantRow[]>();
    if (productIds.length > 0) {
      const { data: variantRows } = await (supabase.from("product_variants") as any)
        .select("id, product_id, option_values, sort_order, retail_price, quantity, sku")
        .in("product_id", productIds)
        .order("sort_order");
      for (const row of variantRows ?? []) {
        const v = row as RawProductVariantRow & { product_id?: string };
        const pid = typeof v.product_id === "string" ? v.product_id : null;
        if (!pid) continue;
        const list = variantsByProduct.get(pid) ?? [];
        list.push(v);
        variantsByProduct.set(pid, list);
      }
    }

    const providerIds = [
      ...new Set(
        (products ?? [])
          .map((p: Record<string, unknown>) => (p.provider as { id?: string } | null | undefined)?.id)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const distanceByProvider = new Map<string, number>();
    if (hasUserCoords && providerIds.length > 0) {
      try {
        const { data: locs } = await (supabase.from("provider_locations") as any)
          .select("provider_id, latitude, longitude")
          .in("provider_id", providerIds)
          .not("latitude", "is", null)
          .not("longitude", "is", null);
        for (const loc of locs ?? []) {
          const providerId = String(loc.provider_id);
          const d = haversineDistanceKmFromCoords(
            latParam,
            lngParam,
            Number(loc.latitude),
            Number(loc.longitude),
          );
          if (!Number.isFinite(d)) continue;
          const rounded = Math.round(d * 10) / 10;
          const prev = distanceByProvider.get(providerId);
          if (prev == null || rounded < prev) distanceByProvider.set(providerId, rounded);
        }
      } catch {
        // Distance is an enhancement; keep product browsing available.
      }
    }

    let mapped = (products ?? []).map((p: Record<string, unknown>) => {
      const productId = typeof p.id === "string" ? p.id : "";
      const rawRow: RawProductRow = {
        id: productId,
        name: typeof p.name === "string" ? p.name : "",
        short_description: (p.short_description as string | null | undefined) ?? null,
        description: null,
        retail_price: p.retail_price as RawProductRow["retail_price"],
        image_urls: (p.image_urls as string[] | null | undefined) ?? null,
        quantity: p.quantity as number | null | undefined,
        track_stock_quantity: p.track_stock_quantity as boolean | null | undefined,
        has_variants: p.has_variants as boolean | null | undefined,
        variant_option_types: p.variant_option_types,
        category: (p.category as string | null | undefined) ?? null,
      };
      const card = transformPublicProduct(
        rawRow,
        productId ? variantsByProduct.get(productId) : undefined,
        defaultCurrency,
      );
      const withListPrice = {
        ...p,
        retail_price: card.price,
        price: card.price,
        currency: card.currency,
      };
      const prov = p.provider as
        | { id: string; business_name: string; slug: string; thumbnail_url?: string | null; avatar_url?: string | null }
        | null
        | undefined;
      if (!prov) return withListPrice;
      return {
        ...withListPrice,
        provider: {
          id: prov.id,
          business_name: prov.business_name,
          slug: prov.slug,
          logo_url: prov.thumbnail_url ?? prov.avatar_url ?? null,
        },
        distance_km: distanceByProvider.get(prov.id) ?? null,
      };
    });
    if (hasUserCoords && sort === "nearest") {
      mapped = mapped.sort(
        (a: Record<string, unknown>, b: Record<string, unknown>) =>
          Number(a.distance_km ?? Infinity) - Number(b.distance_km ?? Infinity),
      );
    }

    return successResponse({
      products: mapped,
      categories: uniqueCategories,
      has_more: page < Math.ceil((count ?? 0) / limit),
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    console.error("[GET /api/public/products]", err);
    return handleApiError(err, "Failed to fetch products");
  }
}
