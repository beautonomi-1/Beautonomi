import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { data, error } = await supabase
      .from('about_us_content')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch about us content");
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
    const body = await request.json();
    const { id } = await params;

    const { title, content, display_order, is_active } = body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "At least one field must be provided for update" },
        { status: 400 }
      );
    }

    const { data, error } = await (supabase.from("about_us_content") as any)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update about us content");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { error } = await supabase
      .from('about_us_content')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete about us content");
  }
}
