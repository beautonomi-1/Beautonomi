import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/** Parse YYYY-MM-DD; optional start/end of day in UTC for inclusive range filters. */
function parseDateParam(raw: string | null, endOfDay: boolean): Date | null {
  if (!raw?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (endOfDay) return new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

/**
 * GET /api/admin/ecommerce/overview — orders, catalog, returns snapshot for the tenant
 *
 * Query: `start_date` / `end_date` (YYYY-MM-DD, optional). When set, order stats, returns stats,
 * and recent orders are filtered by `created_at` (inclusive). Catalog counts are always current.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const url = new URL(request.url);
    const startRaw = url.searchParams.get("start_date");
    const endRaw = url.searchParams.get("end_date");
    const startAt = parseDateParam(startRaw, false);
    const endAt = parseDateParam(endRaw, true);
    if ((startRaw && !startAt) || (endRaw && !endAt)) {
      return errorResponse("start_date and end_date must be YYYY-MM-DD when provided", "VALIDATION_ERROR", 400);
    }
    if (startAt && endAt && endAt < startAt) {
      return errorResponse("end_date must be on or after start_date", "VALIDATION_ERROR", 400);
    }

    const { data: providerRows } = await supabase.from("providers").select("id").eq("tenant_id", tenantId);
    const providerIds = (providerRows ?? []).map((p: { id: string }) => p.id);

    let orderStatQuery = supabase
      .from("product_orders")
      .select("status, payment_status, total_amount, provider:providers!inner(tenant_id)")
      .eq("provider.tenant_id", tenantId);
    if (startAt) orderStatQuery = orderStatQuery.gte("created_at", startAt.toISOString());
    if (endAt) orderStatQuery = orderStatQuery.lte("created_at", endAt.toISOString());
    const { data: orderStatRows } = await orderStatQuery;

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
      /** Parent `products` rows in this tenant (not variant rows). */
      total_products: 0,
      /** `product_variants` rows for those products — true sellable SKUs when `has_variants`. */
      variant_skus: 0,
      /** @deprecated Use total_products; kept for older admin bundles. */
      total_skus: 0,
      active: 0,
      retail_enabled: 0,
      inactive: 0,
      /** Products with has_variants = true (stock/pricing live on variant rows). */
      products_with_variants: 0,
    };
    if (providerIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, is_active, retail_sales_enabled, has_variants")
        .in("provider_id", providerIds);
      const plist = products ?? [];
      const productIds = plist.map((p: { id: string }) => p.id);

      let variant_skus = 0;
      if (productIds.length > 0) {
        const { data: variantRows } = await supabase.from("product_variants").select("id").in("product_id", productIds);
        variant_skus = (variantRows ?? []).length;
      }

      products_summary = {
        total_products: plist.length,
        variant_skus,
        total_skus: plist.length,
        active: plist.filter((p: { is_active?: boolean }) => p.is_active).length,
        retail_enabled: plist.filter((p: { retail_sales_enabled?: boolean }) => p.retail_sales_enabled).length,
        inactive: plist.filter((p: { is_active?: boolean }) => !p.is_active).length,
        products_with_variants: plist.filter((p: { has_variants?: boolean }) => p.has_variants).length,
      };
    }

    let returns_summary = { total: 0, pending: 0, escalated: 0 };
    if (providerIds.length > 0) {
      let retQuery = supabase.from("product_return_requests").select("status").in("provider_id", providerIds);
      if (startAt) retQuery = retQuery.gte("created_at", startAt.toISOString());
      if (endAt) retQuery = retQuery.lte("created_at", endAt.toISOString());
      const { data: retRows } = await retQuery;
      const rlist = retRows ?? [];
      returns_summary = {
        total: rlist.length,
        pending: rlist.filter((r: { status?: string }) => r.status === "pending").length,
        escalated: rlist.filter((r: { status?: string }) => r.status === "escalated").length,
      };
    }

    let recentQuery = supabase
      .from("product_orders")
      .select(
        `id, order_number, status, payment_status, total_amount, currency, fulfillment_type, created_at,
         customer:users!product_orders_customer_id_fkey(id, full_name, email),
         provider:providers!inner(id, business_name, tenant_id)`,
      )
      .eq("provider.tenant_id", tenantId);
    if (startAt) recentQuery = recentQuery.gte("created_at", startAt.toISOString());
    if (endAt) recentQuery = recentQuery.lte("created_at", endAt.toISOString());
    const { data: recentOrders } = await recentQuery.order("created_at", { ascending: false }).limit(8);

    return successResponse({
      order_summary,
      products_summary,
      returns_summary,
      recent_orders: recentOrders ?? [],
      period:
        startAt || endAt
          ? {
              start_date: startRaw?.trim() ?? null,
              end_date: endRaw?.trim() ?? null,
            }
          : null,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load e-commerce overview");
  }
}
