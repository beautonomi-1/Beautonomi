import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateCouponSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  discount_type: z.enum(["percentage", "fixed"]).optional(),
  discount_value: z.number().positive().optional(),
  currency: z.string().optional(),
  min_purchase_amount: z.number().min(0).optional(),
  max_discount_amount: z.number().positive().optional().nullable(),
  valid_from: z.string().datetime().optional().nullable(),
  valid_until: z.string().datetime().optional().nullable(),
  max_uses: z.number().int().positive().optional().nullable(),
  max_uses_per_user: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/coupons/[id]
 * 
 * Get a specific coupon
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { data: coupon, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !coupon) {
      return notFoundResponse("Coupon not found");
    }

    return successResponse({ coupon });
  } catch (error) {
    return handleApiError(error, "Failed to fetch coupon");
  }
}

/**
 * PATCH /api/coupons/[id]
 * 
 * Update a coupon (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
    const { id } = await params;
    const body = await request.json();

    const validated = updateCouponSchema.parse(body);

    // Update coupon
    const updateData: any = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.discount_type !== undefined) updateData.discount_type = validated.discount_type;
    if (validated.discount_value !== undefined) updateData.discount_value = validated.discount_value;
    if (validated.currency !== undefined) updateData.currency = validated.currency;
    if (validated.min_purchase_amount !== undefined) updateData.min_purchase_amount = validated.min_purchase_amount;
    if (validated.max_discount_amount !== undefined) updateData.max_discount_amount = validated.max_discount_amount;
    if (validated.valid_from !== undefined) updateData.valid_from = validated.valid_from;
    if (validated.valid_until !== undefined) updateData.valid_until = validated.valid_until;
    if (validated.max_uses !== undefined) updateData.max_uses = validated.max_uses;
    if (validated.max_uses_per_user !== undefined) updateData.max_uses_per_user = validated.max_uses_per_user;
    if (validated.is_active !== undefined) updateData.is_active = validated.is_active;

    const { data: coupon, error } = await supabase
      .from("coupons")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse({
      coupon,
      message: "Coupon updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to update coupon");
  }
}

/**
 * DELETE /api/coupons/[id]
 * 
 * Delete a coupon (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    // Deactivate instead of delete
    const { error } = await supabase
      .from("coupons")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      throw error;
    }

    return successResponse({
      message: "Coupon deactivated successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to delete coupon");
  }
}
