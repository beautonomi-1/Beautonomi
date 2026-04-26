import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import {
  isReviewContentEditBlocked,
  isSuperadminRole,
  REVIEW_EDIT_WINDOW_MESSAGE,
} from "@/lib/reviews/review-edit-window";

const respondSchema = z.object({
  response: z.string().min(1, "Response is required").max(1000, "Response must be less than 1000 characters"),
});

/**
 * POST /api/provider/reviews/[id]/respond
 * 
 * Provider responds to a review
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
    const validated = respondSchema.parse(body);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get review
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select("id, provider_id, provider_response, provider_response_at")
      .eq("id", reviewId)
      .single();

    if (reviewError || !review) {
      return notFoundResponse("Review not found");
    }

    // Verify review belongs to provider
    if (review.provider_id !== providerId && user.role !== 'superadmin') {
      return errorResponse(
        "You can only respond to reviews for your own business",
        "UNAUTHORIZED",
        403
      );
    }

    if (
      review.provider_response &&
      (review as { provider_response_at?: string | null }).provider_response_at &&
      !isSuperadminRole(user.role) &&
      isReviewContentEditBlocked(
        String((review as { provider_response_at?: string | null }).provider_response_at),
        user.role,
      )
    ) {
      return errorResponse(REVIEW_EDIT_WINDOW_MESSAGE, "REVIEW_EDIT_CLOSED", 403);
    }

    // Check if already responded
    if (review.provider_response) {
      return errorResponse(
        "You have already responded to this review. You can edit your response instead.",
        "ALREADY_RESPONDED",
        400
      );
    }

    // Update review with provider response
    const { data: updatedReview, error: updateError } = await supabase
      .from("reviews")
      .update({
        provider_response: validated.response,
        provider_response_at: new Date().toISOString(),
      })
      .eq("id", reviewId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Notify customer that provider responded
    try {
      const { data: reviewData } = await supabase
        .from("reviews")
        .select("customer_id, booking_id, bookings!inner(booking_number)")
        .eq("id", reviewId)
        .single();

      if (reviewData) {
        const { insertNotification } = await import("@/lib/notifications/insert-notification");
        await insertNotification({
          user_id: reviewData.customer_id,
          type: "review_response",
          title: "Provider Responded to Your Review",
          message: `The provider has responded to your review for booking ${(reviewData.bookings as any)?.booking_number || ''}.`,
          data: {
            review_id: reviewId,
            booking_id: reviewData.booking_id,
          },
          action_url: `/account-settings/bookings/${reviewData.booking_id}`,
        });
      }
    } catch (notifError) {
      console.warn("Failed to notify customer of provider response:", notifError);
    }

    return successResponse({
      review: updatedReview,
      message: "Response added successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to add response to review");
  }
}

/**
 * PATCH /api/provider/reviews/[id]/respond
 * 
 * Provider edits their response to a review
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id: reviewId } = await params;
    const body = await request.json();

    // Validate input
    const validated = respondSchema.parse(body);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get review
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select("id, provider_id, provider_response, provider_response_at")
      .eq("id", reviewId)
      .single();

    if (reviewError || !review) {
      return notFoundResponse("Review not found");
    }

    // Verify review belongs to provider
    if (review.provider_id !== providerId && user.role !== 'superadmin') {
      return errorResponse(
        "You can only edit responses to reviews for your own business",
        "UNAUTHORIZED",
        403
      );
    }

    if (
      (review as { provider_response_at?: string | null }).provider_response_at &&
      !isSuperadminRole(user.role) &&
      isReviewContentEditBlocked(
        String((review as { provider_response_at?: string | null }).provider_response_at),
        user.role,
      )
    ) {
      return errorResponse(REVIEW_EDIT_WINDOW_MESSAGE, "REVIEW_EDIT_CLOSED", 403);
    }

    // Update review with edited response
    const { data: updatedReview, error: updateError } = await supabase
      .from("reviews")
      .update({
        provider_response: validated.response,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reviewId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return successResponse({
      review: updatedReview,
      message: "Response updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to update response");
  }
}
