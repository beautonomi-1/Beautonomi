import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { computeCustomerDisplayRating } from "@/lib/reviews/compute-customer-display-rating";

/**
 * GET /api/me/rating
 * Get current user's rating as a customer (average rating from providers, review count).
 * Used for displaying Uber-style "★ X.X (N reviews)" on customer profile.
 *
 * Prefers a live aggregate from `reviews` + `provider_client_ratings` (same weighting as
 * `sync_customer_rating_aggregates`). Uses the session client when RLS allows; otherwise
 * service_role; finally falls back to `users.rating_average` / `review_count`.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    try {
      const computed = await computeCustomerDisplayRating(supabase, user.id);
      return successResponse({
        rating_average: computed.rating_average,
        review_count: computed.review_count,
      });
    } catch {
      try {
        const admin = getSupabaseAdmin();
        const computed = await computeCustomerDisplayRating(admin, user.id);
        return successResponse({
          rating_average: computed.rating_average,
          review_count: computed.review_count,
        });
      } catch {
        const { data, error } = await supabase
          .from("users")
          .select("rating_average, review_count")
          .eq("id", user.id)
          .single();

        if (error) throw error;

        return successResponse({
          rating_average: Number(data?.rating_average) || 0,
          review_count: Number(data?.review_count) || 0,
        });
      }
    }
  } catch (error) {
    return handleApiError(error, "Failed to fetch rating");
  }
}
