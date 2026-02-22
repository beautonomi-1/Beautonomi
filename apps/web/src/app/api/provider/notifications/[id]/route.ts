import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);    const supabase = await getSupabaseServer(request);

    const body = await request.json();

    const { error } = await supabase
      .from("notifications")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to update notification");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete notification");
  }
}
