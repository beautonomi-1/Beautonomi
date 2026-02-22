import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const moderateSchema = z.object({
  action: z.enum(["flag", "unflag", "hide", "unhide"]),
  reason: z.string().optional(),
});

/**
 * POST /api/provider/reviews/[id]/moderate
 * 
 * Provider flags/hides a review (for moderation)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id: reviewId } = await params;
    const body = await request.json();

    // Validate input
    const validated = moderateSchema.parse(body);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get review
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select("id, provider_id, is_flagged, is_visible")
      .eq("id", reviewId)
      .single();

    if (reviewError || !review) {
      return notFoundResponse("Review not found");
    }

    // Verify review belongs to provider (or user is superadmin)
    if (review.provider_id !== providerId && user.role !== 'superadmin') {
      return errorResponse(
        "You can only moderate reviews for your own business",
        "UNAUTHORIZED",
        403
      );
    }

    // Update review based on action
    const updateData: any = {};
    if (validated.action === 'flag') {
      updateData.is_flagged = true;
      updateData.flagged_reason = validated.reason || 'Flagged by provider';
      updateData.flagged_by = user.id;
    } else if (validated.action === 'unflag') {
      updateData.is_flagged = false;
      updateData.flagged_reason = null;
      updateData.flagged_by = null;
    } else if (validated.action === 'hide') {
      updateData.is_visible = false;
    } else if (validated.action === 'unhide') {
      updateData.is_visible = true;
    }

    const { data: updatedReview, error: updateError } = await supabase
      .from("reviews")
      .update(updateData)
      .eq("id", reviewId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Notify admin if review is flagged
    if (validated.action === 'flag') {
      try {
        const { data: admins } = await supabase
          .from("users")
          .select("id")
          .eq("role", "superadmin")
          .limit(5);

        if (admins) {
          for (const admin of admins) {
            await supabase.from("notifications").insert({
              user_id: admin.id,
              type: "review_flagged",
              title: "Review Flagged for Moderation",
              message: `A review has been flagged by a provider and requires moderation.`,
              metadata: {
                review_id: reviewId,
                provider_id: providerId,
                reason: validated.reason,
              },
              link: `/admin/reviews/${reviewId}`,
            });
          }
        }
      } catch (notifError) {
        console.warn("Failed to notify admins of flagged review:", notifError);
      }
    }

    return successResponse({
      review: updatedReview,
      message: `Review ${validated.action}ed successfully`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to moderate review");
  }
}
