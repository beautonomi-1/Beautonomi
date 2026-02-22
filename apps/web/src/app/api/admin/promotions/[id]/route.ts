import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

/**
 * PATCH /api/admin/promotions/[id]
 * 
 * Update a promotion
 */
const updatePromotionSchema = z.object({
  name: z.string().optional(),
  code: z.string().optional(),
  type: z.string().optional(),
  value: z.number().or(z.string()).optional(),
  min_purchase: z.number().or(z.string()).nullable().optional(),
  max_discount: z.number().or(z.string()).nullable().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  usage_limit: z.number().or(z.string()).nullable().optional(),
  is_active: z.boolean().optional(),
  applicable_to: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validationResult = updatePromotionSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Invalid input data",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    // Verify promotion exists
    const { data: existingPromotion } = await supabase
      .from("promotions")
      .select("id")
      .eq("id", id)
      .single();

    if (!existingPromotion) {
      return notFoundResponse("Promotion not found");
    }

    // Update promotion - map frontend fields to database fields
    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.code !== undefined) updateData.code = body.code.toUpperCase();
    if (body.type !== undefined) {
      // Map 'fixed_amount' to 'fixed' for database enum
      updateData.type = body.type === 'fixed_amount' ? 'fixed' : body.type;
    }
    if (body.value !== undefined) updateData.value = parseFloat(body.value);
    if (body.min_purchase !== undefined)
      updateData.min_purchase_amount = body.min_purchase ? parseFloat(body.min_purchase) : null;
    if (body.max_discount !== undefined)
      updateData.max_discount_amount = body.max_discount ? parseFloat(body.max_discount) : null;
    if (body.start_date !== undefined) {
      updateData.valid_from = new Date(body.start_date).toISOString();
    }
    if (body.end_date !== undefined) {
      updateData.valid_until = new Date(body.end_date).toISOString();
    }
    if (body.usage_limit !== undefined)
      updateData.usage_limit = body.usage_limit ? parseInt(body.usage_limit) : null;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    // Note: applicable_to is derived from applicable_categories/applicable_providers arrays
    // We don't update it directly

    const { data: updatedPromotion, error: updateError } = await supabase
      .from("promotions")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedPromotion) {
      console.error("Error updating promotion:", updateError);
      return handleApiError(updateError, "Failed to update promotion");
    }

    // Transform response to match frontend format
    const transformedPromotion = {
      ...updatedPromotion,
      type: updatedPromotion.type === 'fixed' ? 'fixed_amount' : updatedPromotion.type, // Map 'fixed' to 'fixed_amount' for frontend
      start_date: updatedPromotion.valid_from,
      end_date: updatedPromotion.valid_until,
      min_purchase: updatedPromotion.min_purchase_amount,
      max_discount: updatedPromotion.max_discount_amount,
      used_count: updatedPromotion.usage_count,
      applicable_to: updatedPromotion.applicable_categories?.length > 0 
        ? "category" 
        : updatedPromotion.applicable_providers?.length > 0 
        ? "provider" 
        : "all",
    };

    return successResponse(transformedPromotion);
  } catch (error) {
    return handleApiError(error, "Failed to update promotion");
  }
}

/**
 * DELETE /api/admin/promotions/[id]
 * 
 * Delete a promotion
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    // Verify promotion exists
    const { data: existingPromotion } = await supabase
      .from("promotions")
      .select("id")
      .eq("id", id)
      .single();

    if (!existingPromotion) {
      return notFoundResponse("Promotion not found");
    }

    // Delete promotion
    const { error: deleteError } = await supabase
      .from("promotions")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return handleApiError(deleteError, "Failed to delete promotion");
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete promotion");
  }
}
