import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getProviderGamificationEarnings } from "@/lib/provider/sum-gamification-ledger-net";
import { fetchProviderReviewStats } from "@/lib/provider/fetch-provider-review-stats";
import {
  PROVIDER_POINTS_SELECT,
  fetchProviderGamificationHealSignals,
  syncProviderGamification,
} from "@/lib/provider/ensure-provider-gamification-synced";
import {
  buildBadgeLadder,
  buildProgressToNextBadge,
  resolveJoinedBadge,
} from "@/lib/provider/build-gamification-view";

/**
 * GET /api/provider/gamification
 *
 * Get provider gamification data (points, badge, milestones, transactions).
 * Auto-heals empty ledgers / stale booking counts (post–migration 507 prod fix).
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

    const supabaseAdmin = getSupabaseAdmin();

    const healSignalsInitial = await fetchProviderGamificationHealSignals(supabaseAdmin, providerId);

    const { data: pointsDataInitial, error: pointsError } = await supabase
      .from('provider_points')
      .select(PROVIDER_POINTS_SELECT)
      .eq('provider_id', providerId)
      .maybeSingle();

    if (pointsError) {
      throw pointsError;
    }

    await syncProviderGamification(supabaseAdmin, providerId, {
      ...healSignalsInitial,
      hasProviderPointsRow: !!pointsDataInitial,
    });

    const { data: effectivePointsData, error: pointsRefetchError } = await supabase
      .from('provider_points')
      .select(PROVIDER_POINTS_SELECT)
      .eq('provider_id', providerId)
      .maybeSingle();

    if (pointsRefetchError) {
      throw pointsRefetchError;
    }

    const { data: milestones, error: milestonesError } = await supabase
      .from('provider_milestones')
      .select('id, milestone_type, achieved_at, metadata')
      .eq('provider_id', providerId)
      .order('achieved_at', { ascending: false });

    if (milestonesError) {
      throw milestonesError;
    }

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

    const { data: allBadges, error: badgesError } = await supabase
      .from('provider_badges')
      .select('*')
      .eq('is_active', true)
      .order('tier', { ascending: true });

    if (badgesError) {
      throw badgesError;
    }

    const { count: completedBookingsCount } = await supabaseAdmin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "completed");

    const completedBookings = completedBookingsCount ?? 0;

    const [reviewStats, earnings] = await Promise.all([
      fetchProviderReviewStats(supabaseAdmin, providerId),
      getProviderGamificationEarnings(supabaseAdmin, providerId),
    ]);

    const reviewCount = reviewStats.review_count;
    const ratingAverage = reviewStats.rating_average;

    const badge = resolveJoinedBadge(effectivePointsData?.provider_badges);
    const currentPoints = effectivePointsData?.total_points ?? 0;
    const progressToNextBadge = buildProgressToNextBadge(allBadges, badge, currentPoints);
    const badgeLadder = buildBadgeLadder(allBadges ?? [], badge, progressToNextBadge);

    return successResponse({
      points: {
        total: currentPoints,
        lifetime: effectivePointsData?.lifetime_points || 0,
        current_tier: effectivePointsData?.current_tier_points || 0,
        last_calculated: effectivePointsData?.last_calculated_at,
      },
      badge_ladder: badgeLadder,
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
        /** All-time recognized revenue (finance `recognized_revenue_all_time`). */
        total_earnings: earnings.recognized_revenue,
        recognized_revenue: earnings.recognized_revenue,
        net_earnings_after_refunds: earnings.net_earnings_after_refunds,
        refund_deduction: earnings.refund_deduction,
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

    const { count: transactionCountBefore } = await supabaseAdmin
      .from('provider_point_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId);

    const healSignals = await fetchProviderGamificationHealSignals(supabaseAdmin, providerId, {
      hasProviderPointsRow: true,
    });

    const syncResult = await syncProviderGamification(supabaseAdmin, providerId, healSignals, {
      force: true,
    });

    const { data: pointsAfter } = await supabaseAdmin
      .from("provider_points")
      .select("total_points, current_badge_id")
      .eq("provider_id", providerId)
      .maybeSingle();

    return successResponse({
      message: 'Gamification recalculated successfully',
      points: pointsAfter?.total_points ?? 0,
      badge_id: pointsAfter?.current_badge_id ?? null,
      transactions_backfilled:
        syncResult.transactionsBackfilled || (transactionCountBefore ?? 0) === 0,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to recalculate gamification');
  }
}
