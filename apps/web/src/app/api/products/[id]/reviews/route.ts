import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createReviewSchema = z.object({
  order_id: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  comment: z.string().max(2000).optional(),
  image_urls: z.array(z.string().url()).max(5).optional(),
});

/**
 * GET /api/products/[id]/reviews
 * List reviews for a product (public)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const sort = searchParams.get("sort") || "newest";
    const offset = (page - 1) * limit;

    let query = (supabase.from("product_reviews") as any)
      .select(
        `
        id, rating, title, comment, image_urls, is_verified_purchase,
        helpful_count, provider_response, provider_response_at, created_at,
        customer:users!product_reviews_customer_id_fkey (
          id, full_name, avatar_url
        )
      `,
        { count: "exact" },
      )
      .eq("product_id", id)
      .eq("is_visible", true);

    switch (sort) {
      case "highest":
        query = query.order("rating", { ascending: false });
        break;
      case "lowest":
        query = query.order("rating", { ascending: true });
        break;
      case "helpful":
        query = query.order("helpful_count", { ascending: false });
        break;
      case "newest":
      default:
        query = query.order("created_at", { ascending: false });
        break;
    }

    query = query.range(offset, offset + limit - 1);

    const { data: reviews, error, count } = await query;
    if (error) throw error;

    // Rating distribution
    const { data: allRatings } = await (supabase.from("product_reviews") as any)
      .select("rating")
      .eq("product_id", id)
      .eq("is_visible", true);

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of allRatings ?? []) {
      distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    }

    const total = (allRatings ?? []).length;
    const avgRating =
      total > 0
        ? (allRatings ?? []).reduce((s: number, r: any) => s + r.rating, 0) / total
        : 0;

    return successResponse({
      reviews: reviews ?? [],
      summary: {
        average_rating: Math.round(avgRating * 10) / 10,
        total_count: total,
        distribution,
      },
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch reviews");
  }
}

/**
 * POST /api/products/[id]/reviews
 * Submit a review (must be authenticated, optionally verified purchase)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: productId } = await params;
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const body = await request.json();
    const parsed = createReviewSchema.parse(body);
    const supabase = await getSupabaseServer();

    // Check if already reviewed this product for this order
    if (parsed.order_id) {
      const { data: existing } = await (supabase.from("product_reviews") as any)
        .select("id")
        .eq("product_id", productId)
        .eq("customer_id", user.id)
        .eq("order_id", parsed.order_id)
        .maybeSingle();

      if (existing) {
        return errorResponse("You already reviewed this product for this order", "DUPLICATE", 409);
      }
    }

    // Check verified purchase
    let isVerified = false;
    if (parsed.order_id) {
      const { data: order } = await (supabase.from("product_orders") as any)
        .select("id, status")
        .eq("id", parsed.order_id)
        .eq("customer_id", user.id)
        .in("status", ["delivered", "ready_for_collection"])
        .maybeSingle();
      isVerified = !!order;
    } else {
      // Check if they've ever ordered this product
      const { data: anyOrder } = await (supabase.from("product_order_items") as any)
        .select("id, order:product_orders!inner(customer_id, status)")
        .eq("product_id", productId)
        .limit(1);

      isVerified = (anyOrder ?? []).some(
        (oi: any) =>
          oi.order?.customer_id === user.id &&
          ["delivered", "ready_for_collection"].includes(oi.order?.status),
      );
    }

    const { data: review, error } = await (supabase.from("product_reviews") as any)
      .insert({
        product_id: productId,
        order_id: parsed.order_id ?? null,
        customer_id: user.id,
        rating: parsed.rating,
        title: parsed.title ?? null,
        comment: parsed.comment ?? null,
        image_urls: parsed.image_urls ?? [],
        is_verified_purchase: isVerified,
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse({ review }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to submit review");
  }
}
