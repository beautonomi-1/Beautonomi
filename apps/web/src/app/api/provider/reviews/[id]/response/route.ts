import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  isReviewContentEditBlocked,
  isSuperadminRole,
  REVIEW_EDIT_WINDOW_MESSAGE,
} from "@/lib/reviews/review-edit-window";

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
        provider_response,
        provider_response_at,
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

    const prAt = (review as { provider_response_at?: string | null }).provider_response_at;
    if (
      (review as { provider_response?: string | null }).provider_response &&
      prAt &&
      !isSuperadminRole(permissionCheck.user.role) &&
      isReviewContentEditBlocked(String(prAt), permissionCheck.user.role)
    ) {
      return NextResponse.json(
        { data: null, error: { message: REVIEW_EDIT_WINDOW_MESSAGE, code: "REVIEW_EDIT_CLOSED" } },
        { status: 403 },
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

    const isFirstResponse = !(review as { provider_response?: string | null }).provider_response;
    // Update review with provider response
    const { data: updatedReview, error: updateError } = await (supabase
      .from("reviews") as any)
      .update({
        provider_response: response,
        ...(isFirstResponse ? { provider_response_at: new Date().toISOString() } : {}),
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
        const { insertNotification } = await import("@/lib/notifications/insert-notification");
        await insertNotification({
          user_id: customerId,
          type: "review_response",
          title: "Provider Responded to Your Review",
          message: `The provider has responded to your review. Check it out!`,
          data: {
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
        provider_response_at,
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

    const prAtPatch = (review as { provider_response_at?: string | null }).provider_response_at;
    if (
      prAtPatch &&
      !isSuperadminRole(permissionCheck.user.role) &&
      isReviewContentEditBlocked(String(prAtPatch), permissionCheck.user.role)
    ) {
      return NextResponse.json(
        { data: null, error: { message: REVIEW_EDIT_WINDOW_MESSAGE, code: "REVIEW_EDIT_CLOSED" } },
        { status: 403 },
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
        const { insertNotification: insertReviewUpdateNotif } = await import("@/lib/notifications/insert-notification");
        await insertReviewUpdateNotif({
          user_id: customerId,
          type: "review_response",
          title: "Provider Updated Their Response",
          message: `The provider has updated their response to your review.`,
          data: {
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