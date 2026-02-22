import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin']);
    const { id } = await params;
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase
      .from('footer_settings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch footer setting");
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin']);
    const { id } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { value, description } = body;

    if (value === undefined) {
      return NextResponse.json(
        { error: "value is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('footer_settings')
      .update({
        value,
        description: description !== undefined ? description : undefined,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update footer setting");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin']);
    const { id } = await params;
    const supabase = await getSupabaseServer();

    const { error } = await supabase
      .from('footer_settings')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete footer setting");
  }
}
