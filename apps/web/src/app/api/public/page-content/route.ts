import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/page-content?page_slug=gift-card
 * 
 * Public API to fetch page content for a specific page slug
 * Returns only active content
 */
export async function GET(request: Request) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const pageSlug = searchParams.get("page_slug");

    if (!pageSlug) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "page_slug parameter is required",
            code: "MISSING_PARAMETER",
          },
        },
        { status: 400 }
      );
    }

    const { data: pages, error } = await supabase
      .from("page_content")
      .select("*")
      .eq("page_slug", pageSlug)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching page content:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch page content",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Transform to a map by section_key for easy access
    const contentMap: Record<string, any> = {};
    (pages || []).forEach((page: any) => {
      contentMap[page.section_key] = {
        content: page.content,
        content_type: page.content_type,
        metadata: page.metadata || {},
      };
    });

    return NextResponse.json({
      data: contentMap,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/page-content:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch page content",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
