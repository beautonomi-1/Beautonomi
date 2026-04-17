import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/ecommerce/catalog — all products in tenant (including inactive / not on public shop)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const activeOnly = searchParams.get("active_only") === "1" || searchParams.get("active_only") === "true";
    const retailOnly = searchParams.get("retail_only") === "1" || searchParams.get("retail_only") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "24"), 100);
    const offset = (page - 1) * limit;

    let query = supabase
      .from("products")
      .select(
        `
        id, name, slug, sku, brand, category, retail_price, quantity, low_stock_level,
        supply_price, retail_sales_enabled, is_active, track_stock_quantity, image_urls,
        has_variants, variant_option_types,
        created_at, updated_at,
        provider:providers!inner(id, business_name, slug, tenant_id, status),
        variants:product_variants(id)
      `,
        { count: "exact" },
      )
      .eq("provider.tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (activeOnly) query = query.eq("is_active", true);
    if (retailOnly) query = query.eq("retail_sales_enabled", true);
    if (category) query = query.eq("category", category);
    if (search && search.trim()) {
      const q = search.trim();
      query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,sku.ilike.%${q}%`);
    }

    const { data: products, error, count } = await query;
    if (error) throw error;

    const { data: catRows } = await supabase
      .from("products")
      .select("category, provider:providers!inner(tenant_id)")
      .eq("provider.tenant_id", tenantId)
      .not("category", "is", null);

    const categories = Array.from(
      new Set(
        (catRows ?? [])
          .map((r: { category?: string | null }) => r.category)
          .filter((c): c is string => Boolean(c && String(c).trim())),
      ),
    ).sort();

    const enriched = (products ?? []).map((p: Record<string, unknown>) => {
      const variants = Array.isArray(p.variants) ? p.variants : [];
      return {
        ...p,
        variant_count: variants.length,
        variants: undefined,
      };
    });

    return successResponse({
      products: enriched,
      categories,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch admin product catalog");
  }
}
