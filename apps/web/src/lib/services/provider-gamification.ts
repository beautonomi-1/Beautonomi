/**
 * Provider Gamification Service
 * Handles awarding points, checking badges, and managing provider achievements
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Fetch point rules from DB (used when awarding). Returns map of source -> points. */
async function getPointRules(): Promise<Record<string, number>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("provider_point_rules")
    .select("source, points");
  if (error) return {};
  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    map[row.source] = row.points ?? 0;
  }
  return map;
}

/**
 * Award points to a provider for a specific event
 */
export async function awardProviderPoints(
  providerId: string,
  points: number,
  source: string,
  sourceId?: string,
  description?: string
): Promise<number> {
  try {
    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase.rpc('award_provider_points', {
      p_provider_id: providerId,
      p_points: points,
      p_source: source,
      p_source_id: sourceId || null,
      p_description: description || null,
    });

    if (error) {
      console.error('Error awarding provider points:', error);
      throw error;
    }

    return data || 0;
  } catch (error) {
    console.error('Failed to award provider points:', error);
    throw error;
  }
}

/**
 * Recalculate provider points and check badge eligibility
 */
export async function recalculateProviderGamification(providerId: string): Promise<{
  points: number;
  badge_id: string | null;
}> {
  try {
    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase.rpc('recalculate_provider_gamification', {
      p_provider_id: providerId,
    });

    if (error) {
      console.error('Error recalculating provider gamification:', error);
      throw error;
    }

    return {
      points: data?.points || 0,
      badge_id: data?.badge_id || null,
    };
  } catch (error) {
    console.error('Failed to recalculate provider gamification:', error);
    throw error;
  }
}

/**
 * Award points for a completed booking
 */
export async function awardPointsForBooking(providerId: string, bookingId: string): Promise<void> {
  try {
    const rules = await getPointRules();
    const points = rules["booking_completed"] ?? 10;
    if (points <= 0) return;
    await awardProviderPoints(
      providerId,
      points,
      "booking_completed",
      bookingId,
      "Points awarded for completed booking"
    );
  } catch (error) {
    console.error("Failed to award points for booking:", error);
  }
}

/**
 * Award points for a received review
 */
export async function awardPointsForReview(providerId: string, reviewId: string, rating: number): Promise<void> {
  try {
    const rules = await getPointRules();
    let points = rules["review_received"] ?? 5;
    if (rating >= 5) {
      points += rules["review_received_5star_bonus"] ?? 10;
    } else if (rating >= 4) {
      points += rules["review_received_4star_bonus"] ?? 5;
    }
    if (points <= 0) return;
    await awardProviderPoints(
      providerId,
      points,
      "review_received",
      reviewId,
      `Points awarded for ${rating}-star review`
    );
  } catch (error) {
    console.error("Failed to award points for review:", error);
  }
}

/**
 * Check and award milestones for a provider
 */
export async function checkProviderMilestones(providerId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    
    // Get provider stats
    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select('total_bookings, review_count, rating_average, total_earnings')
      .eq('id', providerId)
      .single();

    if (providerError || !provider) {
      console.error('Error fetching provider for milestone check:', providerError);
      return;
    }

    const milestones: Array<{ type: string; condition: boolean }> = [
      { type: 'first_booking', condition: provider.total_bookings >= 1 },
      { type: 'ten_bookings', condition: provider.total_bookings >= 10 },
      { type: 'fifty_bookings', condition: provider.total_bookings >= 50 },
      { type: 'hundred_bookings', condition: provider.total_bookings >= 100 },
      { type: 'five_hundred_bookings', condition: provider.total_bookings >= 500 },
      { type: 'thousand_bookings', condition: provider.total_bookings >= 1000 },
      { type: 'first_review', condition: provider.review_count >= 1 },
      { type: 'ten_reviews', condition: provider.review_count >= 10 },
      { type: 'fifty_reviews', condition: provider.review_count >= 50 },
      { type: 'hundred_reviews', condition: provider.review_count >= 100 },
      { type: 'perfect_rating', condition: provider.rating_average >= 4.9 && provider.review_count >= 10 },
    ];

    // Check and insert milestones
    for (const milestone of milestones) {
      if (milestone.condition) {
        const { error: insertError } = await supabase
          .from('provider_milestones')
          .upsert(
            {
              provider_id: providerId,
              milestone_type: milestone.type,
              metadata: {
                achieved_at: new Date().toISOString(),
              },
            },
            { onConflict: 'provider_id,milestone_type', ignoreDuplicates: true }
          );

        if (insertError && insertError.code !== '23505') { // 23505 is unique violation, which is fine
          console.error('Error inserting milestone:', insertError);
        }
      }
    }
  } catch (error) {
    console.error('Failed to check provider milestones:', error);
    // Don't throw - this is a non-critical operation
  }
}
