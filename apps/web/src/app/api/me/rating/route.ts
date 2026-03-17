import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/rating
 * Get current user's rating as a customer (average rating from providers, review count).
 * Used for displaying Uber-style "★ X.X (N reviews)" on customer profile.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    const { data, error } = await supabase
      .from("users")
      .select("rating_average, review_count")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    return successResponse({
      rating_average: data?.rating_average ?? 0,
      review_count: data?.review_count ?? 0,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch rating");
  }
}
