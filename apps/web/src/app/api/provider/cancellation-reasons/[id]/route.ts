import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

/**
 * PATCH /api/provider/cancellation-reasons/[id]
 * Update a cancellation reason
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
    const validationResult = updateSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    // For superadmin, allow updating any reason; for providers, only their own
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the reason itself
      const { data: reasonCheck } = await supabase
        .from("cancellation_reasons")
        .select("provider_id")
        .eq("id", id)
        .single();
      if (reasonCheck) {
        providerId = reasonCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Verify cancellation reason exists
    let verifyQuery = supabase
      .from("cancellation_reasons")
      .select("id")
      .eq("id", id);

    if (providerId) {
      verifyQuery = verifyQuery.eq("provider_id", providerId);
    }

    const { data: existing } = await verifyQuery.single();

    if (!existing) {
      return notFoundResponse("Cancellation reason not found");
    }

    // Prepare update data
    const updateData: any = {};
    if (validationResult.data.name !== undefined) {
      updateData.name = validationResult.data.name.trim();
    }
    if (validationResult.data.description !== undefined) {
      updateData.description = validationResult.data.description?.trim() || null;
    }
    if (validationResult.data.is_active !== undefined) {
      updateData.is_active = validationResult.data.is_active;
    }
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("cancellation_reasons")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update cancellation reason");
  }
}

/**
 * DELETE /api/provider/cancellation-reasons/[id]
 * Delete a cancellation reason
 */
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

    // For superadmin, allow deleting any reason; for providers, only their own
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from the reason itself
      const { data: reasonCheck } = await supabase
        .from("cancellation_reasons")
        .select("provider_id")
        .eq("id", id)
        .single();
      if (reasonCheck) {
        providerId = reasonCheck.provider_id;
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Verify cancellation reason exists
    let verifyQuery = supabase
      .from("cancellation_reasons")
      .select("id")
      .eq("id", id);

    if (providerId) {
      verifyQuery = verifyQuery.eq("provider_id", providerId);
    }

    const { data: existing } = await verifyQuery.single();

    if (!existing) {
      return notFoundResponse("Cancellation reason not found");
    }

    const { error } = await supabase.from("cancellation_reasons").delete().eq("id", id);

    if (error) {
      throw error;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete cancellation reason");
  }
}
