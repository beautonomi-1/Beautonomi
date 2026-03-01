import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/products
 * Browse all retail-enabled products across providers.
 * Query params: search, category, provider_id, tags, sort, page, limit
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const providerId = searchParams.get("provider_id");
    const tags = searchParams.get("tags");
    const sort = searchParams.get("sort") || "newest";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "24"), 50);
    const offset = (page - 1) * limit;

    let query = (supabase.from("products") as any)
      .select(
        `
        id, name, slug, brand, category, retail_price, image_urls, short_description,
        quantity, tags, created_at,
        provider:providers (
          id, business_name, slug, logo_url
        )
      `,
        { count: "exact" },
      )
      .eq("is_active", true)
      .eq("retail_sales_enabled", true)
      .gt("quantity", 0);

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
        .gt("quantity", 0)
        .not("category", "is", null)
        .limit(50);
      const categoryList = (categories ?? []) as Array<{ category?: string }>;
      const categoryStrings = categoryList.map((c) => c.category).filter((x): x is string => Boolean(x));
      uniqueCategories = [...new Set(categoryStrings)];
    } catch {
      // keep uniqueCategories []
    }

    return successResponse({
      products: products ?? [],
      categories: uniqueCategories,
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
