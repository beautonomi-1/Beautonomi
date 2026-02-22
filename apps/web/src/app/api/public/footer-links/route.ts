import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section");

    let query = supabase
      .from("footer_links")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (section) {
      query = query.eq("section", section);
    }

    const { data: links, error: linksError } = await query;

    // If tables don't exist yet (migration not run), return empty arrays
    // This allows the footer to render with fallback content
    if (linksError) {
      // Check if it's a "relation does not exist" error
      if (linksError.code === "42P01" || linksError.message?.includes("does not exist")) {
        console.warn("Footer links tables not found. Migration may not have been run yet.");
        return NextResponse.json({
          data: {
            links: [],
            appLinks: [],
          },
          error: null,
        });
      }
      console.error("Error fetching footer links:", linksError);
      // For other errors, still return empty arrays to prevent footer breakage
      return NextResponse.json({
        data: {
          links: [],
          appLinks: [],
        },
        error: null,
      });
    }

    // Also fetch app links
    const { data: appLinks, error: appLinksError } = await supabase
      .from("footer_app_links")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (appLinksError) {
      // Check if it's a "relation does not exist" error
      if (appLinksError.code === "42P01" || appLinksError.message?.includes("does not exist")) {
        console.warn("Footer app links table not found. Migration may not have been run yet.");
      } else {
        console.error("Error fetching app links:", appLinksError);
      }
    }

    return NextResponse.json({
      data: {
        links: links || [],
        appLinks: appLinks || [],
      },
      error: null,
    });
  } catch (error) {
    console.error("Error in GET /api/public/footer-links:", error);
    // Return empty arrays instead of error to prevent footer breakage
    return NextResponse.json({
      data: {
        links: [],
        appLinks: [],
      },
      error: null,
    });
  }
}
