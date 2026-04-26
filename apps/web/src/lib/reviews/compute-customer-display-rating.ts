import type { SupabaseClient } from "@supabase/supabase-js";

export type CustomerDisplayRating = {
  rating_average: number;
  review_count: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Combined provider→customer score: written review stars (`reviews.customer_rating`)
 * plus per-booking stars (`provider_client_ratings`). Matches
 * `sync_customer_rating_aggregates` in migration 432.
 */
export async function computeCustomerDisplayRating(
  db: SupabaseClient,
  customerUserId: string
): Promise<CustomerDisplayRating> {
  const [reviewsRes, bookingRes] = await Promise.all([
    db
      .from("reviews")
      .select("customer_rating")
      .eq("customer_id", customerUserId)
      .not("customer_rating", "is", null),
    db
      .from("provider_client_ratings")
      .select("rating")
      .eq("customer_id", customerUserId)
      .eq("is_visible", true),
  ]);

  if (reviewsRes.error) throw reviewsRes.error;
  if (bookingRes.error) throw bookingRes.error;

  const rVals = (reviewsRes.data ?? [])
    .map((r: { customer_rating: number | null }) => r.customer_rating)
    .filter((x): x is number => typeof x === "number" && x >= 1 && x <= 5);
  const bVals = (bookingRes.data ?? [])
    .map((r: { rating: number }) => r.rating)
    .filter((x): x is number => typeof x === "number" && x >= 1 && x <= 5);

  const rCnt = rVals.length;
  const bCnt = bVals.length;
  const combCnt = rCnt + bCnt;
  if (combCnt === 0) return { rating_average: 0, review_count: 0 };

  const sum =
    rVals.reduce((a, b) => a + b, 0) + bVals.reduce((a, b) => a + b, 0);
  return { rating_average: round2(sum / combCnt), review_count: combCnt };
}
