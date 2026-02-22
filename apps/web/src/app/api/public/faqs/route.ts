import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/faqs
 * 
 * Get all active FAQs, optionally filtered by category
 */
export async function GET(request: Request) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const limit = searchParams.get("limit");

    let query = supabase
      .from("faqs")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (category) {
      query = query.eq("category", category);
    }

    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        query = query.limit(limitNum);
      }
    }

    const { data: faqs, error } = await query;

    if (error) {
      console.error("Error fetching FAQs:", error);
      return NextResponse.json(
        {
          data: [],
          error: {
            message: "Failed to fetch FAQs",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: faqs || [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/faqs:", error);
    return NextResponse.json(
      {
        data: [],
        error: {
          message: "Failed to fetch FAQs",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
