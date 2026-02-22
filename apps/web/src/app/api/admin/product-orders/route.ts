import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/product-orders — superadmin: list all product orders with stats
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const providerId = searchParams.get("provider_id");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    let query = (supabase.from("product_orders") as any)
      .select(
        `*,
        items:product_order_items(id, product_name, quantity, unit_price, total_price),
        customer:users!product_orders_customer_id_fkey(id, full_name, email),
        provider:providers(id, business_name)`,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (providerId) query = query.eq("provider_id", providerId);

    const { data: orders, error, count } = await query;
    if (error) throw error;

    // Aggregate stats
    const { data: stats } = await (supabase.from("product_orders") as any)
      .select("status, total_amount, payment_status")
      .order("created_at", { ascending: false });

    const summary = {
      total_orders: (stats ?? []).length,
      total_revenue: (stats ?? [])
        .filter((o: any) => o.payment_status === "paid")
        .reduce((s: number, o: any) => s + Number(o.total_amount), 0),
      pending: (stats ?? []).filter((o: any) => o.status === "pending").length,
      delivered: (stats ?? []).filter((o: any) => o.status === "delivered").length,
      cancelled: (stats ?? []).filter((o: any) => o.status === "cancelled").length,
    };

    return successResponse({
      orders: orders ?? [],
      summary,
      pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch product orders");
  }
}
