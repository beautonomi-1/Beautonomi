import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createRatingSchema = z.object({
  booking_id: z.string().uuid("Invalid booking ID"),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  location_id: z.string().uuid().optional().nullable(),
});

/**
 * POST /api/provider/ratings
 * 
 * Create a provider-to-client rating
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const body = createRatingSchema.parse(await request.json());
    const { booking_id, rating, comment, location_id } = body;

    // Verify booking exists and belongs to provider
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, provider_id, customer_id, status")
      .eq("id", booking_id)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return handleApiError(new Error("Booking not found"), "Booking not found or doesn't belong to your provider", 404);
    }

    // Only allow ratings for completed or no_show bookings
    if (!["completed", "no_show"].includes(booking.status)) {
      return handleApiError(
        new Error("Invalid booking status"),
        "Ratings can only be created for completed or no-show bookings",
        400
      );
    }

    // Check if rating already exists
    const { data: existing } = await supabase
      .from("provider_client_ratings")
      .select("id")
      .eq("booking_id", booking_id)
      .single();

    if (existing) {
      return handleApiError(new Error("Rating already exists"), "A rating already exists for this booking", 400);
    }

    // Create rating
    const { data: newRating, error: createError } = await supabase
      .from("provider_client_ratings")
      .insert({
        booking_id,
        provider_id: providerId,
        customer_id: booking.customer_id,
        location_id: location_id || null,
        rating,
        comment: comment || null,
        is_visible: true,
      })
      .select("id, rating, comment, created_at")
      .single();

    if (createError) throw createError;

    // Notify customer that provider left a rating.
    try {
      const { insertNotification } = await import("@/lib/notifications/insert-notification");
      await insertNotification({
        user_id: booking.customer_id,
        type: "review_response",
        title: "New feedback from your provider",
        message: `Your provider rated this appointment ${rating}/5${comment ? `: "${comment.slice(0, 140)}"` : "."}`,
        data: {
          booking_id,
          rating,
          comment: comment || null,
          provider_id: providerId,
        },
        action_url: `/account-settings/bookings/${booking_id}`,
      });
    } catch (notifErr) {
      console.warn("Failed to notify customer after provider rating:", notifErr);
    }

    return successResponse(newRating);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        error,
        error.issues.map((e: any) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to create rating");
  }
}

/**
 * GET /api/provider/ratings
 * 
 * Get aggregate ratings for customers (provider view)
 * Returns aggregate statistics, not individual reviews
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get("customer_id");
    const locationId = searchParams.get("location_id");
    const bookingId = searchParams.get("booking_id");

    // If booking_id is provided, check if rating exists for that booking
    if (bookingId) {
      const { data: existingRating, error: checkError } = await supabase
        .from("provider_client_ratings")
        .select("id, booking_id, rating, comment, created_at, updated_at")
        .eq("booking_id", bookingId)
        .eq("provider_id", providerId)
        .maybeSingle();

      if (checkError) {
        throw checkError;
      }

      return successResponse({
        has_rating: !!existingRating,
        rating: existingRating ?? null,
      });
    }

    // Build query for aggregate statistics
    let query = supabase
      .from("provider_client_ratings")
      .select("rating")
      .eq("provider_id", providerId)
      .eq("is_visible", true);

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    const { data: ratings, error } = await query;

    if (error) throw error;

    // Calculate aggregate statistics
    const totalRatings = ratings?.length || 0;
    const averageRating = totalRatings > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
      : 0;
    
    const ratingDistribution = [1, 2, 3, 4, 5].map(star => ({
      stars: star,
      count: ratings?.filter(r => r.rating === star).length || 0,
    }));

    return successResponse({
      total_ratings: totalRatings,
      average_rating: Math.round(averageRating * 100) / 100,
      rating_distribution: ratingDistribution,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch ratings");
  }
}
