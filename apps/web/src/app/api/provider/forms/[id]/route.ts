import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser, notFoundResponse, errorResponse } from "@/lib/supabase/api-helpers";
import {
  isProviderSubscriptionFeatureEnabled,
  SUBSCRIPTION_FEATURE_KEYS,
} from "@/lib/subscriptions/feature-access";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const body = await request.json();

    const { data, error } = await supabase
      .from("provider_forms")
      .update(body)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update form");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const { error } = await supabase
      .from("provider_forms")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) throw error;
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete form");
  }
}
