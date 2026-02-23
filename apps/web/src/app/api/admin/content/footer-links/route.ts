import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section");
    const includeInactive = searchParams.get("include_inactive") === "true";

    let query = supabase
      .from("footer_links")
      .select("*")
      .order("display_order", { ascending: true });

    if (section) {
      query = query.eq("section", section);
    }

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching footer links:", error);
      // Return empty array instead of 500 error
      return NextResponse.json({ data: [], error: null });
    }

    return NextResponse.json({ data: data || [], error: null });
  } catch (error) {
    console.error("Error in GET /api/admin/content/footer-links:", error);
    // Return empty array instead of 500 error
    return NextResponse.json({ data: [], error: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const { section, title, href, display_order, is_external, is_active } = body;

    if (!section || !title || !href) {
      return NextResponse.json(
        { error: "Missing required fields: section, title, href" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("footer_links")
      .insert({
        section,
        title,
        href,
        display_order: display_order ?? 0,
        is_external: is_external ?? false,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating footer link:", error);
      return NextResponse.json(
        { error: "Failed to create footer link" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error: any) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error in POST /api/admin/content/footer-links:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
