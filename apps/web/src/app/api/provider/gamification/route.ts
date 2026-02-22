import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { recalculateProviderGamification } from "@/lib/services/provider-gamification";

/**
 * GET /api/provider/gamification
 * 
 * Get provider gamification data (points, badge, milestones, transactions)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return handleApiError(
        new Error('Provider not found'),
        'NOT_FOUND',
        404
      );
    }

    // Fetch gamification data
    const { data: pointsData, error: pointsError } = await supabase
      .from('provider_points')
      .select(`
        id,
        total_points,
        lifetime_points,
        current_tier_points,
        badge_earned_at,
        badge_expires_at,
        last_calculated_at,
        provider_badges!provider_points_current_badge_id_fkey (
          id,
          name,
          slug,
          description,
          icon_url,
          tier,
          color,
          requirements,
          benefits
        )
      `)
      .eq('provider_id', providerId)
      .maybeSingle();

    if (pointsError) {
      throw pointsError;
    }

    // Fetch milestones
    const { data: milestones, error: milestonesError } = await supabase
      .from('provider_milestones')
      .select('id, milestone_type, achieved_at, metadata')
      .eq('provider_id', providerId)
      .order('achieved_at', { ascending: false });

    if (milestonesError) {
      throw milestonesError;
    }

    // Fetch recent transactions
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const { data: transactions, error: transactionsError } = await supabase
      .from('provider_point_transactions')
      .select('id, points, source, source_id, description, created_at')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (transactionsError) {
      throw transactionsError;
    }

    // Fetch all available badges for progress tracking
    const { data: allBadges, error: badgesError } = await supabase
      .from('provider_badges')
      .select('*')
      .eq('is_active', true)
      .order('tier', { ascending: true });

    if (badgesError) {
      throw badgesError;
    }

    // Get provider stats - calculate directly from source data for accuracy
    const supabaseAdmin = getSupabaseAdmin();
    
    // Calculate total bookings directly from bookings table
    const { count: totalBookingsCount } = await supabaseAdmin
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', providerId);
    
    // Calculate reviews and rating directly from reviews table
    const { data: reviewsData, count: reviewCount } = await supabaseAdmin
      .from('reviews')
      .select('rating', { count: 'exact' })
      .eq('provider_id', providerId);
    
    let averageRating = 0;
    if (reviewsData && reviewsData.length > 0) {
      const sum = reviewsData.reduce((acc, review) => acc + (Number(review.rating) || 0), 0);
      averageRating = sum / reviewsData.length;
    }
    
    // Calculate total earnings from finance_ledger (same as dashboard) for consistency
    // This includes provider_earnings from bookings, add-ons, gift cards, memberships, and refund impacts
    const { data: ledgerRows } = await supabaseAdmin
      .from('finance_ledger')
      .select('net, transaction_type')
      .eq('provider_id', providerId)
      .eq('transaction_type', 'provider_earnings');
    
    let totalEarnings = 0;
    if (ledgerRows) {
      totalEarnings = ledgerRows.reduce((sum, row) => {
        return sum + (Number(row.net ?? 0) || 0);
      }, 0);
    }

    // Calculate progress to next badge
    let progressToNextBadge = null;
    
    const badge = Array.isArray(pointsData?.provider_badges) ? pointsData?.provider_badges?.[0] : pointsData?.provider_badges;
    if (allBadges && pointsData) {
      const currentTier = badge?.tier || 0;
      const nextBadgeCandidate = allBadges.find(b => b.tier > currentTier);
      
      if (nextBadgeCandidate) {
        const _nextBadge = nextBadgeCandidate;
        const requiredPoints = (nextBadgeCandidate.requirements as any)?.points || 0;
        const currentPoints = pointsData.total_points || 0;
        const progress = requiredPoints > 0 
          ? Math.min(100, Math.round((currentPoints / requiredPoints) * 100))
          : 0;
        progressToNextBadge = {
          badge: nextBadgeCandidate,
          current_points: currentPoints,
          required_points: requiredPoints,
          points_needed: Math.max(0, requiredPoints - currentPoints),
          progress_percentage: progress,
        };
      }
    }

    return successResponse({
      points: {
        total: pointsData?.total_points || 0,
        lifetime: pointsData?.lifetime_points || 0,
        current_tier: pointsData?.current_tier_points || 0,
        last_calculated: pointsData?.last_calculated_at,
      },
      current_badge: badge ? {
        id: badge.id,
        name: badge.name,
        slug: badge.slug,
        description: badge.description,
        icon_url: badge.icon_url,
        tier: badge.tier,
        color: badge.color,
        requirements: badge.requirements,
        benefits: badge.benefits,
        earned_at: pointsData.badge_earned_at,
        expires_at: pointsData.badge_expires_at,
      } : null,
      milestones: milestones || [],
      transactions: transactions || [],
      progress_to_next_badge: progressToNextBadge,
      provider_stats: {
        total_bookings: totalBookingsCount || 0,
        review_count: reviewCount || 0,
        rating_average: averageRating,
        total_earnings: totalEarnings,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch gamification data');
  }
}

/**
 * POST /api/provider/gamification
 * 
 * Manually trigger recalculation of provider points and badges
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return handleApiError(
        new Error('Provider not found'),
        'NOT_FOUND',
        404
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    
    // Check if provider has any transactions, if not, backfill them
    const { count: transactionCount } = await supabaseAdmin
      .from('provider_point_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', providerId);
    
    // If no transactions exist, backfill historical data
    if (transactionCount === 0) {
      try {
        await supabaseAdmin.rpc('backfill_provider_point_transactions', {
          p_provider_id: providerId,
        });
      } catch (backfillError) {
        console.warn('Failed to backfill transactions:', backfillError);
        // Continue with recalculation even if backfill fails
      }
    }

    // Recalculate gamification
    const result = await recalculateProviderGamification(providerId);

    return successResponse({
      message: 'Gamification recalculated successfully',
      points: result.points,
      badge_id: result.badge_id,
      transactions_backfilled: transactionCount === 0,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to recalculate gamification');
  }
}
