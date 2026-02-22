import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser, notFoundResponse } from '@/lib/supabase/api-helpers';
import { z } from 'zod';

const respondToReviewSchema = z.object({
  review_id: z.string().uuid('Invalid review ID'),
  response: z.string().min(1, 'Response is required'),
});

/**
 * POST /api/reviews/respond
 * 
 * Add provider response to a review
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin']);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { review_id, response } = respondToReviewSchema.parse(body);

    // Verify the review exists
    const { data: review } = await supabase
      .from('reviews')
      .select('provider_id')
      .eq('id', review_id)
      .single();

    if (!review) {
      return notFoundResponse('Review not found');
    }

    // Verify the review belongs to the provider (unless superadmin)
    if (user.role !== 'superadmin') {
      const providerId = await getProviderIdForUser(user.id);
      if (review.provider_id !== providerId) {
        return handleApiError(
          new Error('Forbidden'),
          'You do not have access to this review',
          'FORBIDDEN',
          403
        );
      }
    }

    // Update review with provider response
    const { data: updatedReview, error } = await supabase
      .from('reviews')
      .update({
        provider_response: response,
        provider_response_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', review_id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(updatedReview);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map(e => e.message).join(', ')),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    return handleApiError(error, 'Failed to add response to review');
  }
}
