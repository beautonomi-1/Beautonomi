import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
  requireAuthInApi,
  errorResponse,
} from '@/lib/supabase/api-helpers';
import {
  isReviewContentEditBlocked,
  isSuperadminRole,
  REVIEW_EDIT_WINDOW_MESSAGE,
} from '@/lib/reviews/review-edit-window';

/**
 * PATCH /api/reviews/[id]
 * 
 * Update a review - allows providers to rate customers
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);
    const { id: reviewId } = await params;
    const body = await request.json();

    // Verify review exists
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .select(
        'id, provider_id, booking_id, customer_rating, customer_comment, customer_rating_created_at, created_at, updated_at',
      )
      .eq('id', reviewId)
      .single();

    if (reviewError || !review) {
      return notFoundResponse('Review not found');
    }

    const role = (user as { role?: string }).role;
    const providerAnchorIso: string | null =
      (review as { customer_rating_created_at?: string | null }).customer_rating_created_at ??
      ((review as { customer_rating?: number | null }).customer_rating != null
        ? String(
            (review as { updated_at?: string; created_at?: string }).updated_at ??
              (review as { created_at?: string }).created_at ??
              '',
          )
        : null);

    const touchesProviderFeedback =
      body.customer_rating !== undefined || body.customer_comment !== undefined;

    if (touchesProviderFeedback && !isSuperadminRole(role)) {
      if (
        providerAnchorIso &&
        isReviewContentEditBlocked(providerAnchorIso, role)
      ) {
        return errorResponse(REVIEW_EDIT_WINDOW_MESSAGE, 'REVIEW_EDIT_CLOSED', 403);
      }
    }

    // Check if user is a provider and owns this review
    const { data: provider } = await supabase
      .from('providers')
      .select('id, user_id')
      .eq('id', review.provider_id)
      .eq('user_id', user.id)
      .single();

    if (!provider) {
      return handleApiError(new Error('Unauthorized'), 'You can only rate customers for your own bookings');
    }

    // Verify booking is completed
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('id', review.booking_id)
      .single();

    if (!booking || !['completed', 'no_show'].includes(booking.status)) {
      return handleApiError(
        new Error('Invalid booking status'),
        'You can only rate customers for completed or no-show bookings'
      );
    }

    // Prepare update data
    const updateData: any = {};
    
    if (body.customer_rating !== undefined) {
      if (body.customer_rating < 1 || body.customer_rating > 5) {
        return handleApiError(new Error('Invalid rating'), 'Rating must be between 1 and 5');
      }
      updateData.customer_rating = body.customer_rating;
      if (!(review as { customer_rating_created_at?: string | null }).customer_rating_created_at) {
        updateData.customer_rating_created_at = new Date().toISOString();
      }
    }

    if (body.customer_comment !== undefined) {
      updateData.customer_comment = body.customer_comment || null;
      if (!(review as { customer_rating_created_at?: string | null }).customer_rating_created_at) {
        updateData.customer_rating_created_at = new Date().toISOString();
      }
    }

    // Update review
    const { data: updatedReview, error: updateError } = await supabase
      .from('reviews')
      .update(updateData)
      .eq('id', reviewId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return successResponse(updatedReview);
  } catch (error) {
    return handleApiError(error, 'Failed to update review');
  }
}

/**
 * DELETE /api/reviews/[id]
 * 
 * Delete a review (superadmin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id: reviewId } = await params;

    // Verify review exists
    const { data: review } = await supabase
      .from('reviews')
      .select('id')
      .eq('id', reviewId)
      .single();

    if (!review) {
      return notFoundResponse('Review not found');
    }

    const { error } = await supabase
      .from('reviews')
      .delete()
      .eq('id', reviewId);

    if (error) {
      throw error;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete review');
  }
}
