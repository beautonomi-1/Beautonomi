import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/content/pages/[slug]
 * 
 * Public endpoint to fetch page content (for pages like privacy-policy, terms, etc.)
 * Only returns active content
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { slug } = await params;
    
    // Fetch all active content for this page slug
    const { data: pages, error } = await supabase
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
          data: [],
          error: null,
        },
        { status: 200 } // Return empty array instead of error
      );
    }

    // Transform to frontend format
    const content = (pages || []).map((p: any) => ({
      id: p.id,
      page_slug: p.page_slug,
      section_key: p.section_key,
      content_type: p.content_type,
      content: p.content,
      metadata: p.metadata || {},
      order: p.display_order || 0,
    }));

    return NextResponse.json({
      data: content,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/content/pages/[slug]:", error);
    return NextResponse.json(
      {
        data: [],
        error: {
          message: "Failed to fetch page content",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
