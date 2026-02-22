import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/providers/[slug]/reviews
 * 
 * Returns reviews for a provider (public view).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    // First get the provider ID from slug
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .single();

    if (providerError || !provider) {
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

    // Fetch reviews with user information
    const { data: reviews, error: reviewsError, count } = await supabase
      .from("reviews")
      .select(`
        id,
        rating,
        comment,
        created_at,
        users:user_id (
          id,
          full_name,
          avatar_url
        )
      `, { count: "exact" })
      .eq("provider_id", provider.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (reviewsError) {
      console.error("Error fetching reviews:", reviewsError);
      return NextResponse.json(
        {
          data: { reviews: [], total: 0, page, limit },
          error: null,
        }
      );
    }

    const formattedReviews = (reviews || []).map((review: any) => {
      const user = review.users || {};
      const reviewerName = user.full_name || "Anonymous";
      const reviewerInitial = reviewerName.charAt(0).toUpperCase();
      
      return {
        id: review.id,
        reviewerName,
        reviewerInitial,
        date: new Date(review.created_at).toLocaleString("en-US", {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        rating: review.rating || 5,
        text: review.comment || "",
        avatar_url: user.avatar_url,
      };
    });

    return NextResponse.json({
      data: {
        reviews: formattedReviews,
        total: count || 0,
        page,
        limit,
        has_more: (count || 0) > offset + limit,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/providers/[slug]/reviews:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch reviews",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
