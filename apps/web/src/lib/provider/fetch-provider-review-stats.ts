import type { SupabaseClient } from "@supabase/supabase-js";

export type ProviderReviewStats = {
  review_count: number;
  rating_average: number;
};

/**
 * Live provider review stats from the reviews table (matches GET /api/provider/reviews
 * totals). Denormalized providers.review_count can drift; gamification Activity uses this.
 */
export async function fetchProviderReviewStats(
  db: SupabaseClient,
  providerId: string
): Promise<ProviderReviewStats> {
  const { data, error } = await db
    .from("reviews")
    .select("rating")
    .eq("provider_id", providerId);

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const review_count = rows.length;

  if (review_count === 0) {
    return { review_count: 0, rating_average: 0 };
  }

  const sum = rows.reduce((acc, row) => acc + Number(row.rating ?? 0), 0);
  const rating_average = Math.round((sum / review_count) * 100) / 100;

  return { review_count, rating_average };
}
