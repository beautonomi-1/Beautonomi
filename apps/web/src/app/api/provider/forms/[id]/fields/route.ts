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
    const { name, field_type, is_required } = body;

    const { data: form } = await supabase
      .from("provider_forms")
      .select("id")
      .eq("id", params.id)
      .eq("provider_id", providerId)
      .single();

    if (!form) return notFoundResponse("Form not found");

    const { data: maxOrder } = await supabase
      .from("provider_form_fields")
      .select("sort_order")
      .eq("form_id", params.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxOrder?.sort_order ?? 0) + 1;

    const { data, error } = await supabase
      .from("provider_form_fields")
      .insert({
        form_id: params.id,
        name,
        field_type,
        is_required: is_required ?? false,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to add form field");
  }
}
