import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const { data, error } = await supabase
      .from('footer_settings')
      .select('*')
      .order('key', { ascending: true });

    if (error) throw error;

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch footer settings");
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const { key, value, description } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: "key and value are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('footer_settings')
      .insert({
        key,
        value,
        description: description || null,
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to create footer setting");
  }
}
