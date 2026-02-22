import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

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

    console.log(`Found ${categories?.length || 0} global service categories (featuredOnly: ${featuredOnly})`);

    // If no categories found, return empty array
    if (!categories || categories.length === 0) {
      console.warn("No categories found in global_service_categories table");
      return successResponse([]);
    }

    // Get provider count for each category (with error handling)
    const categoriesWithCounts = await Promise.all(
      (categories || []).map(async (category: any) => {
        try {
          const { count, error: countError } = await supabase
            .from("provider_global_category_associations")
            .select("*", { count: "exact", head: true })
            .eq("global_category_id", category.id);

          // If count query fails, just set count to 0
          if (countError) {
            console.warn(`Failed to get count for category ${category.id}:`, countError);
            return {
              ...category,
              provider_count: 0,
            };
          }

          return {
            ...category,
            provider_count: count || 0,
          };
        } catch (err) {
          console.warn(`Error getting provider count for category ${category.id}:`, err);
          return {
            ...category,
            provider_count: 0,
          };
        }
      })
    );

    console.log(`Returning ${categoriesWithCounts.length} categories with provider counts`);
    return successResponse(categoriesWithCounts);
  } catch (error) {
    return handleApiError(error, "Failed to fetch global categories");
  }
}
