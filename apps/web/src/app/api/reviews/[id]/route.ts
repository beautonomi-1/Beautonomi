import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse, requireAuthInApi } from '@/lib/supabase/api-helpers';

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
    const supabase = await getSupabaseServer();
    const { id: reviewId } = await params;
    const body = await request.json();

    // Verify review exists
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .select('id, provider_id, booking_id, customer_rating')
      .eq('id', reviewId)
      .single();

    if (reviewError || !review) {
      return notFoundResponse('Review not found');
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

    if (!booking || booking.status !== 'completed') {
      return handleApiError(new Error('Invalid booking status'), 'You can only rate customers for completed bookings');
    }

    // Prepare update data
    const updateData: any = {};
    
    if (body.customer_rating !== undefined) {
      if (body.customer_rating < 1 || body.customer_rating > 5) {
        return handleApiError(new Error('Invalid rating'), 'Rating must be between 1 and 5');
      }
      updateData.customer_rating = body.customer_rating;
      updateData.customer_rating_created_at = new Date().toISOString();
    }

    if (body.customer_comment !== undefined) {
      updateData.customer_comment = body.customer_comment || null;
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
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();
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
