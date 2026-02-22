import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, errorResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  price_monthly: z.number().min(0).optional(),
  currency: z.string().min(3).max(6).optional(),
  discount_percent: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
});

/**
 * PATCH /api/provider/membership-plans/[id]
 * DELETE /api/provider/membership-plans/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);

    // For superadmin, allow updating any plan; for providers, only their own
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the plan itself
      const { data: planCheck } = await (supabase.from("membership_plans") as any)
        .select("provider_id")
        .eq("id", id)
        .single();
      if (planCheck) {
        providerId = planCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) return notFoundResponse("Provider not found");
    }

    // Verify plan exists
    let verifyQuery = (supabase.from("membership_plans") as any)
      .select("id")
      .eq("id", id);

    if (providerId) {
      verifyQuery = verifyQuery.eq("provider_id", providerId);
    }

    const { data: existing } = await verifyQuery.single();
    if (!existing) return notFoundResponse("Membership plan not found");

    // Prepare update data
    const updateData: any = { ...parsed.data, updated_at: new Date().toISOString() };
    if (updateData.name !== undefined) {
      updateData.name = updateData.name.trim();
    }
    if (updateData.description !== undefined) {
      updateData.description = updateData.description?.trim() || null;
    }

    const { data: row, error } = await (supabase.from("membership_plans") as any)
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !row) throw error || new Error("Failed to update plan");
    return successResponse(row);
  } catch (error) {
    return handleApiError(error, "Failed to update membership plan");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // For superadmin, allow deleting any plan; for providers, only their own
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the plan itself
      const { data: planCheck } = await (supabase.from("membership_plans") as any)
        .select("provider_id")
        .eq("id", id)
        .single();
      if (planCheck) {
        providerId = planCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) return notFoundResponse("Provider not found");
    }

    // Verify plan exists
    let verifyQuery = (supabase.from("membership_plans") as any)
      .select("id")
      .eq("id", id);

    if (providerId) {
      verifyQuery = verifyQuery.eq("provider_id", providerId);
    }

    const { data: existing } = await verifyQuery.single();
    if (!existing) return notFoundResponse("Membership plan not found");

    const { error } = await (supabase.from("membership_plans") as any)
      .delete()
      .eq("id", id);

    if (error) throw error;
    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete membership plan");
  }
}

