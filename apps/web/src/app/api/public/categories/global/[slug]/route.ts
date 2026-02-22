import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/categories/global/[slug]
 * 
 * Get single global category with associated providers
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    
    const supabase = await getSupabaseServer();

    const { data: category, error } = await supabase
      .from("global_service_categories")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (error || !category) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Category not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Get providers associated with this category
    const { data: associations, error: assocError } = await supabase
      .from("provider_global_category_associations")
      .select(`
        provider_id,
        providers!inner (
          id,
          slug,
          business_name,
          rating,
          review_count,
          thumbnail_url,
          city,
          country,
          is_verified,
          starting_price,
          currency
        )
      `)
      .eq("global_category_id", category.id);

    if (assocError) {
      console.error("Error fetching provider associations:", assocError);
    }

    const providers = (associations || []).map((assoc: any) => assoc.providers).filter(Boolean);

    return NextResponse.json({
      data: {
        ...category,
        providers: providers || [],
        provider_count: providers.length,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/categories/global/[slug]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch category",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
