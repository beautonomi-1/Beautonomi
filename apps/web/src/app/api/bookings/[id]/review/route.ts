import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/auth-server";
import { awardPointsForReview, checkProviderMilestones } from "@/lib/services/provider-gamification";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { user } = await requireRole(["customer", "provider_owner"]);

    const { id: bookingId } = await params;
    const body = await request.json();
    const { rating, comment, photos } = body;

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
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

    // Verify user is the customer for this booking
    if (user.role === "customer" && booking.customer_id !== user.id) {
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

    // Check if review already exists
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("customer_id", user.id)
      .single();

    if (existingReview) {
      return NextResponse.json(
        { error: "Review already exists for this booking" },
        { status: 400 }
      );
    }

    // Create review
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .insert({
        booking_id: bookingId,
        customer_id: user.id,
        provider_id: booking.provider_id,
        rating,
        comment: comment || null,
        photos: photos || [],
        is_verified: true,
      })
      .select()
      .single();

    if (reviewError) throw reviewError;

    // Notify provider that customer left a review
    try {
      const supabase = await getSupabaseServer();
      const { data: providerData } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", booking.provider_id)
        .single();

      if (providerData?.user_id) {
        await supabase.from("notifications").insert({
          user_id: providerData.user_id,
          type: "new_review",
          title: "New Review Received",
          message: `You received a ${rating}-star review from a customer.`,
          metadata: {
            review_id: review.id,
            booking_id: bookingId,
            rating,
          },
          link: `/provider/reviews`,
        });
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
  } catch (error: any) {
    console.error("Error creating review:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create review" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { user } = await requireRole(["customer"]);

    const { id: bookingId } = await params;
    const body = await request.json();
    const { rating, comment, photos } = body;

    // Get review
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("customer_id", user.id)
      .single();

    if (reviewError || !review) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    // Update review
    const updateData: any = {};
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

    const { data: updatedReview, error: updateError } = await supabase
      .from("reviews")
      .update(updateData)
      .eq("id", review.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ review: updatedReview });
  } catch (error: any) {
    console.error("Error updating review:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update review" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { user } = await requireRole(["customer", "superadmin"]);

    const { id: bookingId } = await params;

    // Get review
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select("*")
      .eq("booking_id", bookingId)
      .single();

    if (reviewError || !review) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    // Verify user is the customer who wrote the review (or superadmin)
    if (user.role === "customer" && review.customer_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Delete review
    const { error: deleteError } = await supabase
      .from("reviews")
      .delete()
      .eq("id", review.id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ message: "Review deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting review:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete review" },
      { status: 500 }
    );
  }
}
