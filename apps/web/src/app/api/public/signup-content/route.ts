import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/signup-content
 * 
 * Get signup page content for public display
 */
export async function GET() {
  try {
    const supabase = await getSupabaseServer();

    const { data: content, error } = await supabase
      .from("page_content")
      .select("*")
      .eq("page_slug", "signup")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Error fetching signup page content:", error);
      return NextResponse.json(
        {
          data: {},
          error: null,
        },
        { status: 200 } // Return empty object instead of error for graceful degradation
      );
    }

    // Transform array to object keyed by section_key for easy access
    const contentMap: Record<string, string> = {};
    (content || []).forEach((item) => {
      contentMap[item.section_key] = item.content;
    });

    return NextResponse.json({
      data: contentMap,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/signup-content:", error);
    return NextResponse.json(
      {
        data: {},
        error: null,
      },
      { status: 200 } // Return empty object for graceful degradation
    );
  }
}
