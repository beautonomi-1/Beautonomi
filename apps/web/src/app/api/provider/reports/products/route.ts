import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const { data: products } = await supabaseAdmin
      .from("provider_products")
      .select("id, name, stock_quantity, reorder_point, price")
      .eq("provider_id", providerId)
      .eq("is_active", true);

    const { data: orderItems } = await supabaseAdmin
      .from("product_order_items")
      .select("product_id, quantity, unit_price, product_orders!inner(provider_id, status)")
      .eq("product_orders.provider_id", providerId)
      .not("product_orders.status", "in", "(cancelled,refunded)");

    const salesMap = new Map<string, { name: string; units: number; revenue: number; stock: number }>();

    (products || []).forEach((p: any) => {
      salesMap.set(p.id, { name: p.name, units: 0, revenue: 0, stock: Number(p.stock_quantity || 0) });
    });

    (orderItems || []).forEach((item: any) => {
      const existing = salesMap.get(item.product_id);
      if (existing) {
        existing.units += Number(item.quantity || 0);
        existing.revenue += Number(item.quantity || 0) * Number(item.unit_price || 0);
      }
    });

    const entries = Array.from(salesMap.values());
    const topProducts = entries
      .map((p) => ({ name: p.name, units_sold: p.units, revenue: p.revenue, current_stock: p.stock }))
      .sort((a, b) => b.units_sold - a.units_sold);

    const lowStock = (products || [])
      .filter((p: any) => p.stock_quantity !== null && p.reorder_point !== null && p.stock_quantity <= p.reorder_point)
      .map((p: any) => ({ name: p.name, stock: p.stock_quantity, reorder_point: p.reorder_point }));

    return successResponse({
      total_product_revenue: entries.reduce((s, p) => s + p.revenue, 0),
      total_units_sold: entries.reduce((s, p) => s + p.units, 0),
      top_products: topProducts,
      low_stock: lowStock,
      package_usage: [],
      package_revenue: 0,
    });
  } catch (error) {
    console.error("Error in products report:", error);
    return handleApiError(error, "Failed to generate products report");
  }
}
