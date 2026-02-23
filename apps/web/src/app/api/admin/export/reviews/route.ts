import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/admin/export/reviews
 * 
 * Export reviews to CSV (rate limited)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRoleInApi(['superadmin'], request);
    const { allowed, retryAfter } = checkRateLimit(auth.user.id, "export:reviews");
    if (!allowed) {
      return errorResponse(
        `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        "RATE_LIMIT_EXCEEDED",
        429
      );
    }

    const supabase = await getSupabaseServer(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const rating = searchParams.get("rating");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    let query = supabase
      .from("reviews")
      .select(`
        *,
        customer:users!reviews_customer_id_fkey(id, full_name, email),
        provider:providers!reviews_provider_id_fkey(id, business_name)
      `)
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (rating) {
      query = query.eq("rating", parseInt(rating));
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data: reviews, error } = await query;

    if (error) {
      return handleApiError(error, "Failed to fetch reviews");
    }

    // Convert to CSV
    const headers = [
      "ID",
      "Rating",
      "Comment",
      "Status",
      "Customer Name",
      "Customer Email",
      "Provider Name",
      "Created At",
      "Updated At",
      "Provider Response",
    ];

    const rows = (reviews || []).map((review: any) => [
      review.id,
      review.rating,
      review.comment || "",
      review.status,
      review.customer?.full_name || "",
      review.customer?.email || "",
      review.provider?.business_name || "",
      review.created_at,
      review.updated_at,
      review.provider_response || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="reviews-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export reviews");
  }
}
