import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";

/**
 * GET /api/admin/promotions/[id]/redemptions
 * 
 * Get promotion redemption history
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    // Verify promotion exists
    const { data: promotion } = await supabase
      .from("promotions")
      .select("id, code")
      .eq("id", id)
      .single();

    if (!promotion) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Promotion not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Get redemptions from bookings that used this promotion
    // Note: This assumes bookings have a promotion_code field
    const { data: redemptions, error, count } = await supabase
      .from("bookings")
      .select(`
        id,
        booking_number,
        customer_id,
        total_amount,
        created_at,
        customer:users!bookings_customer_id_fkey(id, full_name, email)
      `, { count: "exact" })
      .eq("promotion_code", (promotion as any).code)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching redemptions:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch redemptions",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: redemptions || [],
      error: null,
      meta: {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/promotions/[id]/redemptions:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch redemptions",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
