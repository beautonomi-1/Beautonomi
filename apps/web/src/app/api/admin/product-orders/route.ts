import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection,
  successResponse,
  handleApiError,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/product-orders — superadmin: list all product orders with stats
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const paymentStatus = searchParams.get("payment_status");
    const providerId = searchParams.get("provider_id");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    type OrderStatRow = { status?: string; total_amount?: number | string; payment_status?: string };
    let query = supabase
      .from("product_orders")
      .select(
        `*,
        items:product_order_items(id, product_name, quantity, unit_price, total_price),
        customer:users!product_orders_customer_id_fkey(id, full_name, email, phone),
        provider:providers!inner(id, business_name, tenant_id)`,
        { count: "exact" },
      )
      .eq("provider.tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (paymentStatus) query = query.eq("payment_status", paymentStatus);
    if (providerId) query = query.eq("provider_id", providerId);

    const search = searchParams.get("search")?.trim();
    if (search) {
      const safe = search.replace(/[%_]/g, "");
      query = query.or(
        `order_number.ilike.%${safe}%`
      );
    }

    const { data: orders, error, count } = await query;
    if (error) throw error;

    const { data: stats } = await supabase
      .from("product_orders")
      .select("status, total_amount, payment_status, provider:providers!inner(tenant_id)")
      .eq("provider.tenant_id", tenantId)
      .order("created_at", { ascending: false });

    const statRows = (stats ?? []) as OrderStatRow[];
    const byStatus: Record<string, number> = {};
    const byPayment: Record<string, number> = {};
    for (const o of statRows) {
      const st = String(o.status ?? "unknown");
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      const ps = String(o.payment_status ?? "unknown");
      byPayment[ps] = (byPayment[ps] ?? 0) + 1;
    }
    const summary = {
      total_orders: statRows.length,
      total_revenue: statRows
        .filter((o) => o.payment_status === "paid")
        .reduce((s, o) => s + Number(o.total_amount ?? 0), 0),
      pending: statRows.filter((o) => o.status === "pending").length,
      delivered: statRows.filter((o) => o.status === "delivered").length,
      cancelled: statRows.filter((o) => o.status === "cancelled").length,
      paid_payment_count: statRows.filter((o) => o.payment_status === "paid").length,
      pending_payment_count: statRows.filter((o) => o.payment_status === "pending").length,
      by_status: byStatus,
      by_payment_status: byPayment,
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
