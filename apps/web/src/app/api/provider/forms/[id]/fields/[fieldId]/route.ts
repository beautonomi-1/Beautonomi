import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser, notFoundResponse } from "@/lib/supabase/api-helpers";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; fieldId: string } },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: form } = await supabase
      .from("provider_forms")
      .select("id")
      .eq("id", params.id)
      .eq("provider_id", providerId)
      .single();

    if (!form) return notFoundResponse("Form not found");

    const { error } = await supabase
      .from("provider_form_fields")
      .delete()
      .eq("id", params.fieldId)
      .eq("form_id", params.id);

    if (error) throw error;
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete form field");
  }
}
