import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";

export async function GET(_request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();

    const { data, error } = await (supabase.from("about_us_content") as any)
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch about us content");
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { section_key, title, content, display_order, is_active } = body;

    if (!section_key || !title || !content) {
      return NextResponse.json(
        { error: "section_key, title, and content are required" },
        { status: 400 }
      );
    }

    const { data, error } = await (supabase.from("about_us_content") as any)
      .insert({
        section_key,
        title,
        content,
        display_order: display_order || 0,
        is_active: is_active !== undefined ? is_active : true,
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to create about us content");
  }
}
