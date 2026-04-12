/**
 * Provider quality score computation for ranking (Top Rated / Hottest re-order).
 * Uses: reviews_score, completion_rate, cancellations, response_time.
 * Weights from ranking_module_config; components stored in provider_quality_score.components.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_WEIGHTS: Record<string, number> = {
  reviews_score: 0.3,
  completion_rate: 0.3,
  cancellations: 0.2,
  response_time: 0.2,
};

export interface QualityScoreComponents {
  reviews_score: number;
  completion_rate: number;
  cancellations: number;
  response_time: number;
}

export interface QualityScoreResult {
  computed_score: number;
  components: QualityScoreComponents;
}

/**
 * Inputs for score computation (from DB or test).
 */
export interface QualityScoreInputs {
  rating_average: number | null;
  review_count: number | null;
  response_time_hours: number | null;
  completed: number;
  cancelled: number;
  no_show: number;
}

/**
 * Normalize rating 0-5 to 0-1. Optional: damp when review_count is very low.
 */
export function reviewsScore(ratingAverage: number | null, reviewCount: number | null): number {
  const rating = Math.min(5, Math.max(0, Number(ratingAverage) || 0));
  const count = Math.max(0, Number(reviewCount) || 0);
  const raw = rating / 5;
  if (count < 2) return raw * 0.6;
  if (count < 5) return raw * 0.85;
  return raw;
}

/**
 * completion_rate: completed / (completed + cancelled + no_show). 0-1.
 */
export function completionRateComponent(completed: number, cancelled: number, noShow: number): number {
  const denom = completed + cancelled + noShow;
  if (denom === 0) return 0.5;
  return Math.min(1, Math.max(0, completed / denom));
}

/**
 * cancellations: fewer cancelled = higher. 1 - (cancelled/total) when total > 0.
 */
export function cancellationsComponent(completed: number, cancelled: number, noShow: number): number {
  const total = completed + cancelled + noShow;
  if (total === 0) return 1;
  return Math.min(1, Math.max(0, 1 - cancelled / total));
}

/**
 * response_time: 0h -> 1, 24h -> 0.25, 48h+ -> 0. Linear in between.
 */
export function responseTimeComponent(responseTimeHours: number | null): number {
  const h = Math.max(0, Number(responseTimeHours) ?? 24);
  if (h <= 0) return 1;
  if (h >= 48) return 0;
  return Math.max(0, 1 - (h / 48));
}

/**
 * Compute quality score from raw inputs (pure, for testing and reuse).
 */
export function computeQualityScoreFromInputs(
  inputs: QualityScoreInputs,
  weights: Record<string, number> = DEFAULT_WEIGHTS
): QualityScoreResult {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const norm = (w.reviews_score ?? 0) + (w.completion_rate ?? 0) + (w.cancellations ?? 0) + (w.response_time ?? 0);
  const scale = norm > 0 ? 1 / norm : 1;

  const comp: QualityScoreComponents = {
    reviews_score: reviewsScore(inputs.rating_average, inputs.review_count),
    completion_rate: completionRateComponent(inputs.completed, inputs.cancelled, inputs.no_show),
    cancellations: cancellationsComponent(inputs.completed, inputs.cancelled, inputs.no_show),
    response_time: responseTimeComponent(inputs.response_time_hours),
  };

  const computed_score = Math.min(
    1,
    Math.max(
      0,
      (comp.reviews_score * (w.reviews_score ?? 0) +
        comp.completion_rate * (w.completion_rate ?? 0) +
        comp.cancellations * (w.cancellations ?? 0) +
        comp.response_time * (w.response_time ?? 0)) *
        scale
    )
  );

  return { computed_score, components: comp };
}

/**
 * Compute quality score for one provider from DB. Uses providers.rating_average,
 * review_count, response_time_hours and bookings status counts.
 *
 * Only considers bookings from the last 12 months to keep the query bounded and
 * ensure scores reflect recent performance rather than all-time history.
 */
export async function computeQualityScoreForProvider(
  supabase: SupabaseClient,
  providerId: string,
  weights: Record<string, number> = DEFAULT_WEIGHTS
): Promise<QualityScoreResult> {
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: provider }, completedResult, cancelledResult, noShowResult] = await Promise.all([
    supabase
      .from("providers")
      .select("rating_average, review_count, response_time_hours")
      .eq("id", providerId)
      .single(),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "completed")
      .gte("scheduled_at", twelveMonthsAgo),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "cancelled")
      .gte("scheduled_at", twelveMonthsAgo),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "no_show")
      .gte("scheduled_at", twelveMonthsAgo),
  ]);

  const ratingAverage = (provider as any)?.rating_average ?? null;
  const reviewCount = (provider as any)?.review_count ?? null;
  const responseTimeHours = (provider as any)?.response_time_hours ?? null;

  const completed = completedResult.count ?? 0;
  const cancelled = cancelledResult.count ?? 0;
  const noShow = noShowResult.count ?? 0;

  return computeQualityScoreFromInputs(
    {
      rating_average: ratingAverage,
      review_count: reviewCount,
      response_time_hours: responseTimeHours,
      completed,
      cancelled,
      no_show: noShow,
    },
    weights
  );
}
