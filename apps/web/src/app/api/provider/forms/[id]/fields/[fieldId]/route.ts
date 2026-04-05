import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser, notFoundResponse, errorResponse } from "@/lib/supabase/api-helpers";
import {
  isProviderSubscriptionFeatureEnabled,
  SUBSCRIPTION_FEATURE_KEYS,
} from "@/lib/subscriptions/feature-access";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
  try {
    const { id, fieldId } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const formsOk = await isProviderSubscriptionFeatureEnabled(
      providerId,
      SUBSCRIPTION_FEATURE_KEYS.intakeForms
    );
    if (!formsOk) {
      return errorResponse(
        "Intake forms are not included in your current subscription plan.",
        "SUBSCRIPTION_FEATURE_DISABLED",
        403
      );
    }

    const { data: form } = await supabase
      .from("provider_forms")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!form) return notFoundResponse("Form not found");

    const { error } = await supabase
      .from("provider_form_fields")
      .delete()
      .eq("id", fieldId)
      .eq("form_id", id);

    if (error) throw error;
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete form field");
  }
}
