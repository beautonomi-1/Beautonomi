import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { effectiveStockQuantity } from "@/lib/provider-portal/product-inventory-metrics";

type CatalogRow = {
  id: string;
  name: string;
  quantity: number | null;
  low_stock_level: number | null;
  track_stock_quantity: boolean | null;
  has_variants: boolean | null;
  is_active: boolean | null;
  product_variants: { id?: string; quantity?: number | null; low_stock_level?: number | null }[] | null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function lineRevenue(qty: number, unitPrice: number, totalPrice: number): number {
  const total = Number(totalPrice) || 0;
  if (total > 0) return total;
  return qty * (Number(unitPrice) || 0);
}

/**
 * GET /api/provider/reports/products
 *
 * Product sales from appointment `booking_products` plus standalone paid `product_orders`,
 * with catalogue stock from `products` (+ variants).
 * Query: from, to (ISO date), optional location_id.
 */
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

    const { searchParams } = request.nextUrl;
    const locationId = searchParams.get("location_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const { data: catalogRows, error: catalogError } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, quantity, low_stock_level, track_stock_quantity, has_variants, is_active, product_variants(id, quantity, low_stock_level)",
      )
      .eq("provider_id", providerId);

    if (catalogError) {
      throw catalogError;
    }

    const catalog = (catalogRows || []) as CatalogRow[];
    const catalogById = new Map(catalog.map((p) => [p.id, p]));

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        booking_products(
          product_id,
          quantity,
          unit_price,
          total_price,
          products(id, name)
        )
      `,
      )
      .eq("provider_id", providerId)
      .in("status", ["completed", "confirmed", "in_progress", "checked_in"]);

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }
    if (from) {
      bookingsQuery = bookingsQuery.gte("scheduled_at", `${from}T00:00:00.000Z`);
    }
    if (to) {
      bookingsQuery = bookingsQuery.lte("scheduled_at", `${to}T23:59:59.999Z`);
    }

    let ordersQuery = supabaseAdmin
      .from("product_orders")
      .select("id")
      .eq("provider_id", providerId)
      .eq("payment_status", "paid")
      // Appointment orders are fulfillment mirrors for booking_products, which
      // are counted by booking/product reports elsewhere.
      .or("order_source.is.null,order_source.neq.appointment")
      .not("status", "in", "(cancelled,refunded)");

    if (locationId) {
      ordersQuery = ordersQuery.eq("collection_location_id", locationId);
    }
    if (from) {
      ordersQuery = ordersQuery.gte("created_at", `${from}T00:00:00.000Z`);
    }
    if (to) {
      ordersQuery = ordersQuery.lte("created_at", `${to}T23:59:59.999Z`);
    }

    const [{ data: bookings, error: bookingsError }, { data: orders, error: ordersError }] = await Promise.all([
      bookingsQuery,
      ordersQuery,
    ]);
    if (bookingsError) {
      throw bookingsError;
    }
    if (ordersError) {
      throw ordersError;
    }

    const orderIds = (orders || []).map((o: { id: string }) => o.id);

    type SalesAgg = { units: number; revenue: number; fallbackName: string | null };
    const salesByProduct = new Map<string, SalesAgg>();

    for (const booking of bookings || []) {
      const products = (booking as { booking_products?: Array<{
        product_id?: string | null;
        quantity?: number | null;
        unit_price?: number | null;
        total_price?: number | null;
        products?: { name?: string | null } | null;
      }> }).booking_products || [];
      for (const row of products) {
        const pid = row.product_id;
        if (!pid) continue;
        const qty = Number(row.quantity) || 0;
        const rev = lineRevenue(qty, Number(row.unit_price) || 0, Number(row.total_price) || 0);
        const name = typeof row.products?.name === "string" ? row.products.name : null;
        const prev = salesByProduct.get(pid) ?? { units: 0, revenue: 0, fallbackName: null };
        prev.units += qty;
        prev.revenue += rev;
        if (!prev.fallbackName && name) prev.fallbackName = name;
        salesByProduct.set(pid, prev);
      }
    }

    if (orderIds.length > 0) {
      for (const ids of chunk(orderIds, 80)) {
        const { data: items, error: itemsError } = await supabaseAdmin
          .from("product_order_items")
          .select("product_id, quantity, unit_price, total_price, product_name")
          .in("order_id", ids);

        if (itemsError) {
          throw itemsError;
        }

        for (const row of items || []) {
          const pid = row.product_id as string | null;
          if (!pid) continue;
          const qty = Number(row.quantity) || 0;
          const rev = lineRevenue(qty, Number(row.unit_price) || 0, Number(row.total_price) || 0);
          const name = typeof row.product_name === "string" ? row.product_name : null;
          const prev = salesByProduct.get(pid) ?? { units: 0, revenue: 0, fallbackName: null };
          prev.units += qty;
          prev.revenue += rev;
          if (!prev.fallbackName && name) prev.fallbackName = name;
          salesByProduct.set(pid, prev);
        }
      }
    }

    const total_product_revenue = Array.from(salesByProduct.values()).reduce((s, v) => s + v.revenue, 0);
    const total_units_sold = Array.from(salesByProduct.values()).reduce((s, v) => s + v.units, 0);

    const top_products = Array.from(salesByProduct.entries())
      .map(([productId, agg]) => {
        const cat = catalogById.get(productId);
        const stock = cat
          ? effectiveStockQuantity({
              quantity: cat.quantity,
              has_variants: cat.has_variants,
              track_stock_quantity: cat.track_stock_quantity,
              product_variants: cat.product_variants ?? undefined,
            })
          : undefined;
        return {
          name: cat?.name ?? agg.fallbackName ?? "Product",
          units_sold: agg.units,
          revenue: agg.revenue,
          ...(stock !== undefined ? { current_stock: stock } : {}),
        };
      })
      .sort((a, b) => b.units_sold - a.units_sold);

    const low_stock = catalog
      .filter((p) => p.track_stock_quantity !== false && p.is_active !== false)
      .map((p) => {
        const stock = effectiveStockQuantity({
          quantity: p.quantity,
          has_variants: p.has_variants,
          track_stock_quantity: p.track_stock_quantity,
          product_variants: p.product_variants ?? undefined,
        });
        const threshold = Number(p.low_stock_level) || 5;
        return { p, stock, threshold };
      })
      .filter(({ stock, threshold }) => stock > 0 && stock <= threshold)
      .map(({ p, stock, threshold }) => ({
        name: p.name,
        stock,
        reorder_point: threshold,
      }));

    return successResponse({
      total_product_revenue,
      total_units_sold,
      top_products,
      low_stock,
      package_usage: [],
      package_revenue: 0,
      report_basis:
        "Product revenue includes appointment booking_products and standalone paid product_orders. Appointment product_orders are excluded as fulfillment mirrors.",
    });
  } catch (error) {
    console.error("Error in GET /api/provider/reports/products:", error);
    return handleApiError(error, "Failed to generate products report");
  }
}
