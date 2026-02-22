import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayOffId: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id, dayOffId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!staff) {
      return notFoundResponse("Staff member not found");
    }

    const { error: deleteError } = await supabase
      .from("staff_days_off")
      .delete()
      .eq("id", dayOffId)
      .eq("staff_id", id);

    if (deleteError) {
      if (deleteError.code === '42P01') {
        return successResponse({ success: true });
      }
      throw deleteError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete day off");
  }
}
