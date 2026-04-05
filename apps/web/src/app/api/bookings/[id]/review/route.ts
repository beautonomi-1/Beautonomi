import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { awardPointsForReview, checkProviderMilestones } from "@/lib/services/provider-gamification";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["customer"], request);
    const supabase = await getSupabaseServer(request);

    const { id: bookingId } = await params;
    const body = await request.json();
    const { rating, comment, photos, service_ratings, staff_rating } = body;

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    if (service_ratings !== undefined) {
      const validServiceRatings =
        Array.isArray(service_ratings) &&
        service_ratings.every(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            typeof entry.offering_id === "string" &&
            entry.offering_id.length > 0 &&
            typeof entry.rating === "number" &&
            entry.rating >= 1 &&
            entry.rating <= 5
        );
      if (!validServiceRatings) {
        return NextResponse.json(
          { error: "service_ratings must be an array of { offering_id, rating(1-5) }" },
          { status: 400 }
        );
      }
    }

    if (staff_rating !== undefined && staff_rating !== null) {
      const validStaffRating =
        typeof staff_rating === "object" &&
        typeof staff_rating.staff_id === "string" &&
        staff_rating.staff_id.length > 0 &&
        typeof staff_rating.rating === "number" &&
        staff_rating.rating >= 1 &&
        staff_rating.rating <= 5;
      if (!validStaffRating) {
        return NextResponse.json(
          { error: "staff_rating must be { staff_id, rating(1-5) } or null" },
          { status: 400 }
        );
      }
    }

    // Get booking to verify ownership
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, customer_id, provider_id, status")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    if (booking.customer_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Check if booking is completed
    if (booking.status !== "completed") {
      return NextResponse.json(
        { error: "Can only review completed bookings" },
        { status: 400 }
      );
    }

    // One review per booking (unique on booking_id)
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("id")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (existingReview) {
      return NextResponse.json(
        { error: "Review already exists for this booking" },
        { status: 400 }
      );
    }

    // Create review
    let review: any = null;
    const insertPayload = {
      booking_id: bookingId,
      customer_id: user.id,
      provider_id: booking.provider_id,
      rating,
      comment: comment || null,
      photos: Array.isArray(photos) ? photos : [],
      service_ratings: Array.isArray(service_ratings) ? service_ratings : [],
      staff_rating: staff_rating ?? null,
      is_verified: true,
      status: "published",
      is_visible: true,
    };

    const withStatus = await supabase
      .from("reviews")
      .insert(insertPayload)
      .select()
      .single();

    if (withStatus.error) {
      const message = `${withStatus.error.message || ""} ${withStatus.error.details || ""}`.toLowerCase();
      const missingStatusColumn =
        message.includes("status") && (message.includes("column") || message.includes("schema cache"));
      if (!missingStatusColumn) {
        throw withStatus.error;
      }
      const withoutStatus = await supabase
        .from("reviews")
        .insert({
          booking_id: bookingId,
          customer_id: user.id,
          provider_id: booking.provider_id,
          rating,
          comment: comment || null,
          photos: Array.isArray(photos) ? photos : [],
          service_ratings: Array.isArray(service_ratings) ? service_ratings : [],
          staff_rating: staff_rating ?? null,
          is_verified: true,
          is_visible: true,
        })
        .select()
        .single();
      if (withoutStatus.error) throw withoutStatus.error;
      review = withoutStatus.data;
    } else {
      review = withStatus.data;
    }

    // Notify provider that customer left a review
    try {
      const supabaseNotify = await getSupabaseServer(request);
      const { data: providerData } = await supabaseNotify
        .from("providers")
        .select("user_id")
        .eq("id", booking.provider_id)
        .single();

      if (providerData?.user_id) {
        const { insertNotification } = await import("@/lib/notifications/insert-notification");
        await insertNotification({
          user_id: providerData.user_id,
          type: "new_review",
          title: "New Review Received",
          message: `You received a ${rating}-star review from a customer.${comment ? ` "${String(comment).slice(0, 120)}"` : ""}`,
          data: {
            review_id: review.id,
            booking_id: bookingId,
            rating,
            comment: comment || null,
            photos: Array.isArray(photos) ? photos : [],
          },
          action_url: `/provider/reviews`,
        });

        // Push/email template notification for provider apps/channels.
        try {
          const { notifyProviderNewReview } = await import("@/lib/notifications/notification-service");
          const { data: customerUser } = await supabaseNotify
            .from("users")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();
          await notifyProviderNewReview(
            review.id,
            customerUser?.full_name || "Customer",
            Number(rating),
            comment || "",
            providerData.user_id,
            undefined,
            { bookingId }
          );
        } catch (pushErr) {
          console.warn("Failed to send provider push/email for new review:", pushErr);
        }
      }
    } catch (notifError) {
      // Log but don't fail the request
      console.warn("Failed to create provider notification for review:", notifError);
    }

    // Award points and check milestones (non-blocking)
    if (review && booking.provider_id) {
      awardPointsForReview(booking.provider_id, review.id, rating).catch(err => 
        console.error('Failed to award points for review:', err)
      );
      checkProviderMilestones(booking.provider_id).catch(err => 
        console.error('Failed to check milestones:', err)
      );
    }

    return NextResponse.json({ review });
  } catch (error: unknown) {
    console.error("Error creating review:", error);
    const message = error instanceof Error ? error.message : "Failed to create review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const { id: bookingId } = await params;
    const body = await request.json();
    const { rating, comment, photos, service_ratings, staff_rating } = body;

    let reviewQuery = supabase
      .from("reviews")
      .select("*")
      .eq("booking_id", bookingId);
    if (user.role !== "superadmin") {
      reviewQuery = reviewQuery.eq("customer_id", user.id);
    }
    const { data: review, error: reviewError } = await reviewQuery.single();

    if (reviewError || !review) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return NextResponse.json(
          { error: "Rating must be between 1 and 5" },
          { status: 400 }
        );
      }
      updateData.rating = rating;
    }
    if (comment !== undefined) updateData.comment = comment;
    if (photos !== undefined) updateData.photos = photos;
    if (service_ratings !== undefined) {
      const validServiceRatings =
        Array.isArray(service_ratings) &&
        service_ratings.every(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            typeof entry.offering_id === "string" &&
            entry.offering_id.length > 0 &&
            typeof entry.rating === "number" &&
            entry.rating >= 1 &&
            entry.rating <= 5
        );
      if (!validServiceRatings) {
        return NextResponse.json(
          { error: "service_ratings must be an array of { offering_id, rating(1-5) }" },
          { status: 400 }
        );
      }
      updateData.service_ratings = service_ratings;
    }
    if (staff_rating !== undefined) {
      if (staff_rating === null) {
        updateData.staff_rating = null;
      } else {
        const validStaffRating =
          typeof staff_rating === "object" &&
          typeof staff_rating.staff_id === "string" &&
          staff_rating.staff_id.length > 0 &&
          typeof staff_rating.rating === "number" &&
          staff_rating.rating >= 1 &&
          staff_rating.rating <= 5;
        if (!validStaffRating) {
          return NextResponse.json(
            { error: "staff_rating must be { staff_id, rating(1-5) } or null" },
            { status: 400 }
          );
        }
        updateData.staff_rating = staff_rating;
      }
    }

    const { data: updatedReview, error: updateError } = await supabase
      .from("reviews")
      .update(updateData)
      .eq("id", review.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ review: updatedReview });
  } catch (error: unknown) {
    console.error("Error updating review:", error);
    const message = error instanceof Error ? error.message : "Failed to update review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const { id: bookingId } = await params;

    let deleteQuery = supabase
      .from("reviews")
      .select("*")
      .eq("booking_id", bookingId);
    if (user.role !== "superadmin") {
      deleteQuery = deleteQuery.eq("customer_id", user.id);
    }
    const { data: review, error: reviewError } = await deleteQuery.single();

    if (reviewError || !review) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    // Delete review
    const { error: deleteError } = await supabase
      .from("reviews")
      .delete()
      .eq("id", review.id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ message: "Review deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting review:", error);
    const message = error instanceof Error ? error.message : "Failed to delete review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
