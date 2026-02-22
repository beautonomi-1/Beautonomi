import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * POST /api/provider/reviews/[id]/response
 * 
 * Add or update provider response to a review
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit reviews
    const permissionCheck = await requirePermission('edit_reviews', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const _auth = { user: permissionCheck.user };

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const { response } = body;

    if (!response) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "response is required",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // Get provider ID
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .or(`user_id.eq.${permissionCheck.user.id},staff_members.user_id.eq.${permissionCheck.user.id}`)
      .single();

    if (!provider) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const providerData = provider as any;

    // Verify review belongs to provider's booking
    const { data: review } = await supabase
      .from("reviews")
      .select(
        `
        id,
        booking_id,
        bookings:bookings!reviews_booking_id_fkey(provider_id)
      `
      )
      .eq("id", id)
      .single();

    const reviewData = review as any;
    if (!review || reviewData.bookings?.provider_id !== providerData.id) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Review not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Get customer ID from review
    const { data: reviewWithCustomer } = await supabase
      .from("reviews")
      .select(`
        id,
        customer_id,
        booking_id,
        bookings:bookings!reviews_booking_id_fkey(
          customer_id,
          provider_id
        )
      `)
      .eq("id", id)
      .single();

    // Update review with provider response
    const { data: updatedReview, error: updateError } = await (supabase
      .from("reviews") as any)
      .update({
        provider_response: response,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedReview) {
      console.error("Error updating review response:", updateError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update review response",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Notify customer that provider responded to their review
    const customerId = reviewWithCustomer?.customer_id || (reviewWithCustomer as any)?.bookings?.customer_id;
    if (customerId) {
      try {
        await supabase.from("notifications").insert({
          user_id: customerId,
          type: "review_response",
          title: "Provider Responded to Your Review",
          message: `The provider has responded to your review. Check it out!`,
          metadata: {
            review_id: id,
            booking_id: reviewWithCustomer?.booking_id || (reviewWithCustomer as any)?.bookings?.id,
            provider_id: providerData.id,
          },
        });
      } catch (notifError) {
        // Log but don't fail the request
        console.warn("Failed to create notification for review response:", notifError);
      }
    }

    return NextResponse.json({
      data: updatedReview,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/provider/reviews/[id]/response:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update review response",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/provider/reviews/[id]/response
 * 
 * Edit existing provider response to a review
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit reviews
    const permissionCheck = await requirePermission('edit_reviews', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const _auth = { user: permissionCheck.user };

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const { response } = body;

    if (!response) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "response is required",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // Get provider ID
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .or(`user_id.eq.${permissionCheck.user.id},staff_members.user_id.eq.${permissionCheck.user.id}`)
      .single();

    if (!provider) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const providerData = provider as any;

    // Verify review belongs to provider's booking and has a response
    const { data: review } = await supabase
      .from("reviews")
      .select(
        `
        id,
        booking_id,
        provider_response,
        bookings:bookings!reviews_booking_id_fkey(provider_id)
      `
      )
      .eq("id", id)
      .single();

    const reviewData = review as any;
    if (!review || reviewData.bookings?.provider_id !== providerData.id) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Review not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    if (!review.provider_response) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "No response exists to edit. Use POST to create a response.",
            code: "NO_RESPONSE",
          },
        },
        { status: 400 }
      );
    }

    // Get customer ID from review
    const { data: reviewWithCustomer } = await supabase
      .from("reviews")
      .select(`
        id,
        customer_id,
        booking_id,
        bookings:bookings!reviews_booking_id_fkey(
          customer_id,
          provider_id
        )
      `)
      .eq("id", id)
      .single();

    // Update review response
    const { data: updatedReview, error: updateError } = await (supabase
      .from("reviews") as any)
      .update({
        provider_response: response,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedReview) {
      console.error("Error updating review response:", updateError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update review response",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Notify customer that provider updated their response
    const customerId = reviewWithCustomer?.customer_id || (reviewWithCustomer as any)?.bookings?.customer_id;
    if (customerId) {
      try {
        await supabase.from("notifications").insert({
          user_id: customerId,
          type: "review_response_updated",
          title: "Provider Updated Their Response",
          message: `The provider has updated their response to your review.`,
          metadata: {
            review_id: id,
            booking_id: reviewWithCustomer?.booking_id || (reviewWithCustomer as any)?.bookings?.id,
            provider_id: providerData.id,
          },
        });
      } catch (notifError) {
        // Log but don't fail the request
        console.warn("Failed to create notification for review response update:", notifError);
      }
    }

    return NextResponse.json({
      data: updatedReview,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in PATCH /api/provider/reviews/[id]/response:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update review response",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}