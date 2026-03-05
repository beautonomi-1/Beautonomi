/**
 * GET /api/public/learn/categories
 * List Learning Center categories (public only). Optional ?audience= filter.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const audience = searchParams.get("audience");

    let query = supabase
      .from("learning_categories")
      .select("id, title, slug, icon, sort_order, audience, parent_id")
      .eq("visibility", "public")
      .order("sort_order", { ascending: true });

    if (audience && ["general", "customer", "provider"].includes(audience)) {
      query = query.or(`audience.eq.${audience},audience.eq.general`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching learn categories:", error);
      return NextResponse.json({ data: [], error: null });
    }

    return NextResponse.json({ data: data ?? [], error: null });
  } catch (err) {
    console.error("Unexpected error in GET /api/public/learn/categories:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch categories", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
