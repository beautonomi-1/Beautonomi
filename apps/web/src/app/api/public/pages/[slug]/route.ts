import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/pages/[slug]
 * 
 * Get all active content for a specific page
 * Returns content grouped by section_key
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    
    const supabase = await getSupabaseServer();

    const { data: pageContent, error } = await supabase
      .from("page_content")
      .select("*")
      .eq("page_slug", slug)
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

    // Group content by section_key
    const groupedContent = (pageContent || []).reduce((acc, item) => {
      if (!acc[item.section_key]) {
        acc[item.section_key] = [];
      }
      acc[item.section_key].push(item);
      return acc;
    }, {} as Record<string, typeof pageContent>);

    return NextResponse.json({
      data: groupedContent,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/pages/[slug]:", error);
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
