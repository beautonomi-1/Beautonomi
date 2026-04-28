import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";

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
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) return tenantRes;
    const { tenantId } = tenantRes;

    const supabase = await getSupabaseServer();
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const rawPage = parseInt(searchParams.get("page") || "1", 10);
    const rawLimit = parseInt(searchParams.get("limit") || "20", 10);
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 20;
    const offset = (page - 1) * limit;

    // First get the provider ID from slug
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .eq("tenant_id", tenantId)
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

    // Fetch reviews with user information.
    // Some DB environments expose `status`, others only `is_visible`.
    // Try status-based filter first, then gracefully fallback.
    let reviews: {
      id: string;
      rating?: number;
      comment?: string;
      created_at: string;
      provider_response?: string | null;
      provider_response_at?: string | null;
      users?:
        | { id?: string; full_name?: string; avatar_url?: string; email?: string }
        | Array<{ id?: string; full_name?: string; avatar_url?: string; email?: string }>
        | null;
    }[] | null = null;
    let count: number | null = 0;
    let reviewsError: { message?: string } | null = null;

    const statusFiltered = await supabase
      .from("reviews")
      .select(`
        id,
        rating,
        comment,
        created_at,
        provider_response,
        provider_response_at,
        users:customer_id (
          id,
          full_name,
          avatar_url,
          email
        )
      `, { count: "exact" })
      .eq("provider_id", provider.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (!statusFiltered.error) {
      reviews = statusFiltered.data;
      count = statusFiltered.count ?? 0;
    } else {
      const visibleFiltered = await supabase
        .from("reviews")
        .select(`
          id,
          rating,
          comment,
          created_at,
          provider_response,
          provider_response_at,
          users:customer_id (
            id,
            full_name,
            avatar_url,
            email
          )
        `, { count: "exact" })
        .eq("provider_id", provider.id)
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      reviews = visibleFiltered.data;
      count = visibleFiltered.count ?? 0;
      reviewsError = visibleFiltered.error;
    }

    if (reviewsError) {
      console.error("Error fetching reviews:", reviewsError);
      return NextResponse.json(
        {
          data: { reviews: [], total: 0, page, limit },
          error: null,
        }
      );
    }

    const displayNameFromEmail = (email?: string | null) => {
      if (!email) return null;
      const localPart = email.split("@")[0] ?? "";
      const cleaned = localPart
        .replace(/[._-]+/g, " ")
        .replace(/\d+/g, " ")
        .trim();
      if (!cleaned) return null;
      return cleaned
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
    };

    const isAnonymousLabel = (value?: string | null) => {
      if (!value) return true;
      return /anon/i.test(value.trim());
    };

    const formattedReviews = (reviews || []).map((review: { id: string; rating?: number; comment?: string; created_at: string; provider_response?: string | null; provider_response_at?: string | null; users?: { id?: string; full_name?: string; avatar_url?: string; email?: string } | Array<{ id?: string; full_name?: string; avatar_url?: string; email?: string }> | null }) => {
      const userRaw = review.users;
      const user = userRaw == null ? {} : (Array.isArray(userRaw) ? userRaw[0] : userRaw) as { id?: string; full_name?: string; avatar_url?: string; email?: string };
      const fallbackFromEmail = displayNameFromEmail(user.email);
      const fallbackFromId = user.id ? `Customer ${user.id.slice(0, 4).toUpperCase()}` : null;
      const reviewerName = !isAnonymousLabel(user.full_name)
        ? user.full_name!.trim()
        : fallbackFromEmail ?? fallbackFromId ?? "Verified customer";
      const reviewerInitial = reviewerName.charAt(0).toUpperCase();
      
      return {
        id: review.id,
        // Canonical API fields used by mobile/web clients.
        comment: review.comment ?? "",
        created_at: review.created_at,
        author: {
          full_name: reviewerName,
          avatar_url: user.avatar_url ?? null,
          email: user.email ?? null,
        },
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
        rating: review.rating ?? 0,
        text: review.comment ?? "",
        avatar_url: user.avatar_url ?? "",
        provider_response: review.provider_response ?? null,
        provider_response_at: review.provider_response_at ?? null,
      };
    });

    const res = NextResponse.json({
      data: {
        reviews: formattedReviews,
        total: count || 0,
        page,
        limit,
        has_more: (count || 0) > offset + limit,
      },
      error: null,
    });
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=180");
    return res;
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
