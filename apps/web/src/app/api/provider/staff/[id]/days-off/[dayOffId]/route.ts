import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { isMissingRelationError, migrationRequiredResponse } from "@/lib/supabase/migration-required";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dayOffId: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
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

    const { data: existingDayOff } = await supabase
      .from("staff_days_off")
      .select("date")
      .eq("id", dayOffId)
      .eq("staff_id", id)
      .maybeSingle();

    const { error: deleteError } = await supabase
      .from("staff_days_off")
      .delete()
      .eq("id", dayOffId)
      .eq("staff_id", id);

    if (deleteError) {
      if (isMissingRelationError(deleteError)) {
        return migrationRequiredResponse("Staff days off");
      }
      throw deleteError;
    }

    if ((existingDayOff as { date?: string } | null)?.date) {
      await supabase
        .from("staff_time_off")
        .delete()
        .eq("staff_id", id)
        .eq("provider_id", providerId)
        .eq("start_date", (existingDayOff as { date: string }).date)
        .eq("end_date", (existingDayOff as { date: string }).date)
        .eq("status", "approved");
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete day off");
  }
}
