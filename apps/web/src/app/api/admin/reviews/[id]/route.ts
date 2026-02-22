import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, errorResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

const updateReviewSchema = z.object({
  is_visible: z.boolean().optional(),
  is_flagged: z.boolean().optional(),
  flagged_reason: z.string().optional().nullable(),
  comment: z.string().optional().nullable(),
});

/**
 * GET /api/admin/reviews/[id]
 * 
 * Get a single review by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { data: review, error } = await supabase
      .from("reviews")
      .select(`
        id,
        booking_id,
        customer_id,
        provider_id,
        rating,
        comment,
        service_ratings,
        staff_rating,
        provider_response,
        provider_response_at,
        is_verified,
        is_flagged,
        flagged_reason,
        flagged_by,
        is_visible,
        helpful_count,
        created_at,
        updated_at,
        customer:users!reviews_customer_id_fkey(id, full_name, email, avatar_url),
        provider:providers!reviews_provider_id_fkey(id, business_name, logo_url),
        booking:bookings(id, booking_number, status)
      `)
      .eq("id", id)
      .single();

    if (error || !review) {
      return notFoundResponse("Review not found");
    }

    return successResponse(review);
  } catch (error) {
    return handleApiError(error, "Failed to fetch review");
  }
}

/**
 * PATCH /api/admin/reviews/[id]
 * 
 * Update a review (moderate, flag, hide, edit)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { id } = await params;
    const body = await request.json();

    // Validate request body
    const validationResult = updateReviewSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify review exists
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("id, provider_id, customer_id")
      .eq("id", id)
      .single();

    if (!existingReview) {
      return notFoundResponse("Review not found");
    }

    const updateData: any = {};
    if (validationResult.data.is_visible !== undefined) {
      updateData.is_visible = validationResult.data.is_visible;
    }
    if (validationResult.data.is_flagged !== undefined) {
      updateData.is_flagged = validationResult.data.is_flagged;
      if (validationResult.data.flagged_reason !== undefined) {
        updateData.flagged_reason = validationResult.data.flagged_reason;
      }
      if (validationResult.data.is_flagged) {
        updateData.flagged_by = auth.user.id;
      } else {
        updateData.flagged_reason = null;
        updateData.flagged_by = null;
      }
    }
    if (validationResult.data.comment !== undefined) {
      updateData.comment = validationResult.data.comment;
    }

    const { data: updatedReview, error } = await supabase
      .from("reviews")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.review.update",
      entity_type: "review",
      entity_id: id,
      metadata: updateData,
    });

    return successResponse(updatedReview);
  } catch (error) {
    return handleApiError(error, "Failed to update review");
  }
}

/**
 * DELETE /api/admin/reviews/[id]
 * 
 * Delete a review
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { id } = await params;

    // Verify review exists
    const { data: review } = await supabase
      .from("reviews")
      .select("id, provider_id, customer_id")
      .eq("id", id)
      .single();

    if (!review) {
      return notFoundResponse("Review not found");
    }

    const { error } = await supabase.from("reviews").delete().eq("id", id);

    if (error) {
      throw error;
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.review.delete",
      entity_type: "review",
      entity_id: id,
      metadata: {},
    });

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete review");
  }
}
