import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// Cache categories for 1 hour (they don't change often)
export const revalidate = 3600;

/**
 * GET /api/public/categories
 * 
 * Returns all active categories with subcategories.
 */
export async function GET() {
  try {
    const supabase = await getSupabaseServer();

    const selectWithI18n = `
        id,
        slug,
        name,
        description,
        icon,
        name_i18n,
        is_active,
        subcategories (
          id,
          category_id,
          slug,
          name,
          description,
          is_active
        )
      `;
    const selectLegacy = `
        id,
        slug,
        name,
        description,
        icon,
        is_active,
        subcategories (
          id,
          category_id,
          slug,
          name,
          description,
          is_active
        )
      `;

    let { data: categories, error } = await supabase
      .from("global_service_categories")
      .select(selectWithI18n)
      .eq("is_active", true)
      .order("name");

    if (error && /name_i18n/i.test(error.message ?? "")) {
      const retry = await supabase
        .from("global_service_categories")
        .select(selectLegacy)
        .eq("is_active", true)
        .order("name");
      categories = (retry.data ?? []).map((row) => ({
        ...row,
        name_i18n: null,
      }));
      error = retry.error;
    }

    if (error) {
      console.error("Error fetching categories:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch categories",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      data: categories || [],
      error: null,
    });

    // Add cache headers
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=7200"
    );

    return response;
  } catch (error) {
    console.error("Unexpected error in /api/public/categories:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch categories",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
