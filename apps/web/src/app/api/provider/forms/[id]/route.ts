import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser, notFoundResponse } from "@/lib/supabase/api-helpers";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = await request.json();

    const { data, error } = await supabase
      .from("provider_forms")
      .update(body)
      .eq("id", params.id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update form");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { error } = await supabase
      .from("provider_forms")
      .delete()
      .eq("id", params.id)
      .eq("provider_id", providerId);

    if (error) throw error;
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete form");
  }
}
