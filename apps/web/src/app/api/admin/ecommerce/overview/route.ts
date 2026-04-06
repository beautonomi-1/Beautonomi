import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/ecommerce/overview — orders, catalog, returns snapshot for the tenant
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: providerRows } = await supabase.from("providers").select("id").eq("tenant_id", tenantId);
    const providerIds = (providerRows ?? []).map((p: { id: string }) => p.id);

    const { data: orderStatRows } = await supabase
      .from("product_orders")
      .select("status, payment_status, total_amount, provider:providers!inner(tenant_id)")
      .eq("provider.tenant_id", tenantId);

    type O = { status?: string; payment_status?: string; total_amount?: number | string };
    const orders = (orderStatRows ?? []) as O[];
    const order_summary = {
      total_orders: orders.length,
      total_revenue_paid: orders
        .filter((o) => o.payment_status === "paid")
        .reduce((s, o) => s + Number(o.total_amount ?? 0), 0),
      pending: orders.filter((o) => o.status === "pending").length,
      by_status: orders.reduce<Record<string, number>>((acc, o) => {
        const k = String(o.status ?? "unknown");
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
      by_payment_status: orders.reduce<Record<string, number>>((acc, o) => {
        const k = String(o.payment_status ?? "unknown");
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    };

    let products_summary = {
      total_skus: 0,
      active: 0,
      retail_enabled: 0,
      inactive: 0,
    };
    if (providerIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, is_active, retail_sales_enabled")
        .in("provider_id", providerIds);
      const plist = products ?? [];
      products_summary = {
        total_skus: plist.length,
        active: plist.filter((p: { is_active?: boolean }) => p.is_active).length,
        retail_enabled: plist.filter((p: { retail_sales_enabled?: boolean }) => p.retail_sales_enabled).length,
        inactive: plist.filter((p: { is_active?: boolean }) => !p.is_active).length,
      };
    }

    let returns_summary = { total: 0, pending: 0, escalated: 0 };
    if (providerIds.length > 0) {
      const { data: retRows } = await supabase
        .from("product_return_requests")
        .select("status")
        .in("provider_id", providerIds);
      const rlist = retRows ?? [];
      returns_summary = {
        total: rlist.length,
        pending: rlist.filter((r: { status?: string }) => r.status === "pending").length,
        escalated: rlist.filter((r: { status?: string }) => r.status === "escalated").length,
      };
    }

    const { data: recentOrders } = await supabase
      .from("product_orders")
      .select(
        `id, order_number, status, payment_status, total_amount, currency, fulfillment_type, created_at,
         customer:users!product_orders_customer_id_fkey(id, full_name, email),
         provider:providers!inner(id, business_name, tenant_id)`,
      )
      .eq("provider.tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8);

    return successResponse({
      order_summary,
      products_summary,
      returns_summary,
      recent_orders: recentOrders ?? [],
    });
  } catch (err) {
    return handleApiError(err, "Failed to load e-commerce overview");
  }
}
