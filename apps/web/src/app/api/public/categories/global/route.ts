import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import type { ApiResponse } from "@/lib/supabase/api-helpers";

/** Public data; browser + CDN cache so repeat navigation (home → category → back) is instant. */
const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=3600, stale-while-revalidate=7200";

/**
 * GET /api/public/categories/global
 *
 * Get all active global categories (for home page)
 * Only returns featured categories by default, or all if ?all=true
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const _all = searchParams.get("all") === "true";

    let query = supabase
      .from("global_service_categories")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    // Return all active categories by default (not just featured)
    // Featured filter is only applied if explicitly requested via ?featured=true
    const featuredOnly = searchParams.get("featured") === "true";
    if (featuredOnly) {
      query = query.eq("is_featured", true);
    }

    const { data: categories, error } = await query;

    if (error) {
      console.error("Error fetching global categories:", error);
      // Check if it's a table not found error or any database error
      if (error.code === "42P01" || error.message?.includes("does not exist") || error.code === "PGRST116") {
        console.warn("Table 'global_service_categories' may not exist in database, returning empty array");
        // Return empty array instead of error to allow fallback in frontend
        return successResponse([]);
      }
      // For any other error, also return empty array to prevent 500 errors
      console.warn("Error fetching categories, returning empty array:", error);
      return successResponse([]);
    }

    // If no categories found, return empty array
    if (!categories || categories.length === 0) {
      return successResponse([]);
    }

    const categoryIds = categories.map((c: { id: string }) => c.id);

    // One query for all provider counts (avoids N round-trips to Supabase per category).
    const countByCategory = new Map<string, number>();
    const { data: assocRows, error: assocError } = await supabase
      .from("provider_global_category_associations")
      .select("global_category_id")
      .in("global_category_id", categoryIds);

    if (assocError) {
      console.warn("Failed to batch-fetch provider counts for global categories:", assocError);
    } else {
      for (const row of assocRows ?? []) {
        const id = row.global_category_id as string;
        countByCategory.set(id, (countByCategory.get(id) ?? 0) + 1);
      }
    }

    const categoriesWithCounts = categories.map((category: Record<string, unknown>) => ({
      ...category,
      provider_count: countByCategory.get(category.id as string) ?? 0,
    }));

    return NextResponse.json<ApiResponse<typeof categoriesWithCounts>>(
      { data: categoriesWithCounts, error: null },
      {
        status: 200,
        headers: { "Cache-Control": CACHE_CONTROL },
      }
    );
  } catch (error) {
    return handleApiError(error, "Failed to fetch global categories");
  }
}
