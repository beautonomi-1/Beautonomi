import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser, notFoundResponse } from "@/lib/supabase/api-helpers";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("id", params.id)
      .eq("provider_id", providerId)
      .single();

    if (!staff) return notFoundResponse("Staff member not found");

    const body = await request.json();
    const { service_ids } = body;

    if (!Array.isArray(service_ids)) {
      return handleApiError(new Error("service_ids must be an array"), "VALIDATION_ERROR", 400);
    }

    await supabase
      .from("staff_service_assignments")
      .delete()
      .eq("staff_id", params.id);

    if (service_ids.length > 0) {
      const inserts = service_ids.map((sid: string) => ({
        staff_id: params.id,
        service_id: sid,
      }));

      const { error } = await supabase
        .from("staff_service_assignments")
        .insert(inserts);

      if (error) throw error;
    }

    const { error: updateError } = await supabase
      .from("provider_staff")
      .update({ assigned_service_ids: service_ids })
      .eq("id", params.id);

    if (updateError) {
      console.warn("Could not update assigned_service_ids column:", updateError);
    }

    return successResponse({ success: true, service_ids });
  } catch (error) {
    return handleApiError(error, "Failed to update staff services");
  }
}
