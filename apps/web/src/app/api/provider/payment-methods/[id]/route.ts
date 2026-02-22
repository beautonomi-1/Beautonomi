import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * PATCH /api/provider/payment-methods/[id]
 * Update a payment method
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const providerId = await getProviderIdForUser(permissionCheck.user!.id);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const updates: any = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.is_default !== undefined) updates.is_default = body.is_default;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    const { data: paymentMethod, error } = await supabase
      .from("provider_payment_methods")
      .update(updates)
      .eq("id", params.id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!paymentMethod) {
      return handleApiError(
        new Error("Payment method not found"),
        "Payment method not found",
        "NOT_FOUND",
        404
      );
    }

    return successResponse(paymentMethod);
  } catch (error) {
    return handleApiError(error, "Failed to update payment method");
  }
}

/**
 * DELETE /api/provider/payment-methods/[id]
 * Delete a payment method
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(permissionCheck.user!.id);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from("provider_payment_methods")
      .update({ is_active: false })
      .eq("id", params.id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete payment method");
  }
}
