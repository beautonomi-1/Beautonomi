import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { recalculateProviderGamification } from "@/lib/services/provider-gamification";
import { sumProviderGamificationLedgerNet } from "@/lib/provider/sum-gamification-ledger-net";

const PROVIDER_POINTS_SELECT = `
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
      `;

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

    // Stats shown here must match what badge eligibility uses (`providers` + completed bookings).
    const supabaseAdmin = getSupabaseAdmin();

    const { count: completedBookingsCount } = await supabaseAdmin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "completed");

    const completedBookings = completedBookingsCount ?? 0;

    const { data: provRow } = await supabaseAdmin
      .from("providers")
      .select("total_bookings, review_count, rating_average")
      .eq("id", providerId)
      .maybeSingle();

    const totalEarnings = await sumProviderGamificationLedgerNet(supabaseAdmin, providerId);

    const storedBookings = Number(provRow?.total_bookings ?? 0);
    const reviewCount = Number(provRow?.review_count ?? 0);
    const ratingAverage = Number(provRow?.rating_average ?? 0);

    let effectivePointsData = pointsData;

    if (provRow && storedBookings !== completedBookings) {
      const { error: syncBookingsError } = await supabaseAdmin
        .from("providers")
        .update({ total_bookings: completedBookings })
        .eq("id", providerId);

      if (!syncBookingsError) {
        await recalculateProviderGamification(providerId);
        const { data: refreshedPoints, error: refetchError } = await supabase
          .from("provider_points")
          .select(PROVIDER_POINTS_SELECT)
          .eq("provider_id", providerId)
          .maybeSingle();
        if (!refetchError) {
          effectivePointsData = refreshedPoints;
        }
      }
    }

    // Calculate progress to next badge
    let progressToNextBadge = null;

    const badge = Array.isArray(effectivePointsData?.provider_badges)
      ? effectivePointsData?.provider_badges?.[0]
      : effectivePointsData?.provider_badges;
    // Progress must work when provider_points row is missing (treat as 0 points until first sync).
    if (allBadges) {
      const currentTier = badge?.tier || 0;
      const nextBadgeCandidate = allBadges.find(b => b.tier > currentTier);
      
      if (nextBadgeCandidate) {
        const _nextBadge = nextBadgeCandidate;
        const requiredPoints = (nextBadgeCandidate.requirements as any)?.points || 0;
        const currentPoints = effectivePointsData?.total_points || 0;
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
        total: effectivePointsData?.total_points || 0,
        lifetime: effectivePointsData?.lifetime_points || 0,
        current_tier: effectivePointsData?.current_tier_points || 0,
        last_calculated: effectivePointsData?.last_calculated_at,
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
        earned_at: effectivePointsData?.badge_earned_at,
        expires_at: effectivePointsData?.badge_expires_at,
      } : null,
      milestones: milestones || [],
      transactions: transactions || [],
      progress_to_next_badge: progressToNextBadge,
      provider_stats: {
        total_bookings: completedBookings,
        review_count: reviewCount,
        rating_average: ratingAverage,
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

    // Sync completed booking count only; review_count and rating_average are maintained by DB triggers.
    const { count: completedBookings } = await supabaseAdmin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "completed");

    await supabaseAdmin
      .from("providers")
      .update({
        total_bookings: completedBookings ?? 0,
      })
      .eq("id", providerId);

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
