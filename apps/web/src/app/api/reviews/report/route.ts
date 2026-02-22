import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { z } from 'zod';

const reportReviewSchema = z.object({
  review_id: z.string().uuid('Invalid review ID'),
  reason: z.string().min(1, 'Reason is required'),
});

/**
 * POST /api/reviews/report
 * 
 * Report a review
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin']);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { review_id, reason } = reportReviewSchema.parse(body);

    // Verify review exists
    const { data: review } = await supabase
      .from('reviews')
      .select('id')
      .eq('id', review_id)
      .single();

    if (!review) {
      return handleApiError(
        new Error('Review not found'),
        'Review not found',
        'NOT_FOUND',
        404
      );
    }

    // Create report
    const { data: report, error } = await supabase
      .from('review_reports')
      .insert({
        review_id,
        reported_by: user.id,
        reason,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(report);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map(e => e.message).join(', ')),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    return handleApiError(error, 'Failed to report review');
  }
}
