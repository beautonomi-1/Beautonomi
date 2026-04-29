import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  isProviderSubscriptionFeatureEnabled,
  SUBSCRIPTION_FEATURE_KEYS,
} from "@/lib/subscriptions/feature-access";

const formUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    form_type: z.enum(["intake", "consent", "waiver"]).optional(),
    is_required: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id } = await params;
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

    const raw = await request.json();
    const parsed = formUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);
    }
    const body = parsed.data;
    if (Object.keys(body).length === 0) {
      return errorResponse("No valid fields to update", "VALIDATION_ERROR", 400);
    }

    const updatePayload = {
      ...body,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("provider_forms")
      .update(updatePayload)
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
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id } = await params;
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
