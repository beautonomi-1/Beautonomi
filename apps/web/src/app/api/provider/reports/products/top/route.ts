import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  filterProductOrdersForLocation,
  getProviderReportContext,
  reportDateRangeFromParams,
  type LocationLinkedProductOrderRow,
} from "@/lib/reports/provider-report-utils";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";

/** Orders query shape — ids preserved through location filter */
type ProductOrderTopRow = LocationLinkedProductOrderRow & { id: string };

function lineRevenue(qty: number, unitPrice: number, totalPrice: number): number {
  const total = Number(totalPrice) || 0;
  if (total > 0) return total;
  return qty * (Number(unitPrice) || 0);
}

/**
 * GET /api/provider/reports/products/top
 *
 * Ranks products by **aggregated line revenue** from:
 * - `booking_products` on bookings whose **scheduled_at** is in range (statuses: completed, confirmed, in_progress, checked_in).
 * - **Paid** `product_orders` whose **created_at** is in range; rows with `order_source = appointment` excluded (those lines appear on bookings).
 *
 * `timesSold` = count of **line rows** (one booking_products row or one product_order_items row), not appointments or orders.
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate, fromYmd, toYmd } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });

    const limitRaw = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);

    const locationId = searchParams.get("location_id") || undefined;

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at")
      .eq("provider_id", providerId)
      .in("status", ["completed", "confirmed", "in_progress", "checked_in"])
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    let ordersQuery = supabaseAdmin
      .from("product_orders")
      .select("id, created_at, fulfillment_type, collection_location_id")
      .eq("provider_id", providerId)
      .eq("payment_status", "paid")
      .or("order_source.is.null,order_source.neq.appointment")
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());

    const [bookingsResult, ordersResult] = await Promise.all([bookingsQuery, ordersQuery]);

    const { data: bookings } = bookingsResult;
    const { data: ordersRaw } = ordersResult;
    const bookingIds = bookings?.map((b) => b.id) || [];
    const orders = await filterProductOrdersForLocation<ProductOrderTopRow>(
      supabaseAdmin,
      providerId,
      (ordersRaw || []) as ProductOrderTopRow[],
      locationId,
    );
    const orderIds = orders.map((s) => s.id) || [];

    let bookingProductsQuery = supabaseAdmin.from("booking_products").select(`
        id,
        product_id,
        quantity,
        unit_price,
        total_price,
        products (
          id,
          name,
          category,
          retail_price
        )
      `);

    if (bookingIds.length > 0) {
      bookingProductsQuery = bookingProductsQuery.in("booking_id", bookingIds);
    } else {
      bookingProductsQuery = bookingProductsQuery.eq("booking_id", "00000000-0000-0000-0000-000000000000");
    }

    const { data: bookingProducts, error: bookingProductsError } = await bookingProductsQuery;

    let orderItemsQuery = supabaseAdmin.from("product_order_items").select(`
        id,
        product_id,
        product_name,
        quantity,
        unit_price,
        total_price
      `);

    if (orderIds.length > 0) {
      orderItemsQuery = orderItemsQuery.in("order_id", orderIds);
    } else {
      orderItemsQuery = orderItemsQuery.eq("order_id", "00000000-0000-0000-0000-000000000000");
    }

    const { data: orderItems, error: orderItemsError } = await orderItemsQuery;

    const orderItemProductIds = new Set<string>();
    orderItems?.forEach((item: { product_id?: string }) => {
      if (item.product_id) orderItemProductIds.add(item.product_id);
    });

    const orderItemProductMap = new Map<string, { name: string; category: string; retail_price: number }>();
    if (orderItemProductIds.size > 0) {
      const { data: productsData } = await supabaseAdmin
        .from("products")
        .select("id, name, category, retail_price")
        .in("id", Array.from(orderItemProductIds));

      productsData?.forEach((p: { id: string; name?: string; category?: string; retail_price?: unknown }) => {
        orderItemProductMap.set(p.id, {
          name: p.name || "Unknown",
          category: p.category || "Uncategorized",
          retail_price: Number(p.retail_price || 0),
        });
      });
    }

    if (bookingProductsError && !bookingProductsError.message.includes("booking_products")) {
      console.error("Error fetching booking products:", bookingProductsError);
    }
    if (orderItemsError) {
      console.error("Error fetching product order items:", orderItemsError);
    }

    const productMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        category: string;
        totalQuantity: number;
        totalRevenue: number;
        averagePrice: number;
        timesSold: number;
      }
    >();

    bookingProducts?.forEach((bp: Record<string, unknown>) => {
      const product = bp.products as { id?: string; name?: string; category?: string } | null;
      if (!product?.id) return;

      const productId = product.id;
      const existing = productMap.get(productId) || {
        productId,
        productName: product.name || "Unknown",
        category: product.category || "Uncategorized",
        totalQuantity: 0,
        totalRevenue: 0,
        averagePrice: 0,
        timesSold: 0,
      };

      const quantity = Number(bp.quantity || 1);
      const price = lineRevenue(quantity, Number(bp.unit_price || 0), Number(bp.total_price || 0));

      existing.totalQuantity += quantity;
      existing.totalRevenue += price;
      existing.timesSold += 1;
      productMap.set(productId, existing);
    });

    orderItems?.forEach((item: Record<string, unknown>) => {
      if (!item.product_id) return;

      const productInfo = orderItemProductMap.get(item.product_id as string);
      const productId = item.product_id as string;
      const existing = productMap.get(productId) || {
        productId,
        productName: productInfo?.name || (item.product_name as string) || "Unknown",
        category: productInfo?.category || "Uncategorized",
        totalQuantity: 0,
        totalRevenue: 0,
        averagePrice: 0,
        timesSold: 0,
      };

      const quantity = Number(item.quantity || 1);
      const price = lineRevenue(quantity, Number(item.unit_price || 0), Number(item.total_price || 0));

      existing.totalQuantity += quantity;
      existing.totalRevenue += price;
      existing.timesSold += 1;
      productMap.set(productId, existing);
    });

    const topProducts = Array.from(productMap.values())
      .map((product) => ({
        ...product,
        averagePrice: product.totalQuantity > 0 ? product.totalRevenue / product.totalQuantity : 0,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);

    const allProducts = Array.from(productMap.values());
    const totalProductsSold = allProducts.reduce((sum, p) => sum + p.totalQuantity, 0);
    const totalRevenue = allProducts.reduce((sum, p) => sum + p.totalRevenue, 0);

    const reportBasis =
      `Period ${fromYmd}–${toYmd} (${reportContext.timezone}). Products ranked by total line revenue from ` +
      `booking_products on appointments with scheduled_at in range (status completed, confirmed, in_progress, checked_in) ` +
      `plus product_order_items on paid orders with created_at in range (appointment-mirror orders excluded). ` +
      `Line revenue uses total_price when present, otherwise quantity × unit_price. ` +
      `Summary totals are across every distinct product with sales in the window; the table shows the top ${limit} by revenue.`;

    return successResponse({
      timezone: reportContext.timezone,
      fromYmd,
      toYmd,
      limit,
      reportBasis,
      basis: {
        bookingLines:
          "booking_products rows tied to bookings whose scheduled_at falls in the filter window (and booking location when location_id is set).",
        orderLines:
          "product_order_items on paid orders whose created_at falls in the window; appointment-source orders excluded.",
        revenue: "Per line: total_price if set, else quantity × unit_price.",
        ranking: `Products sorted by sum of line revenue; list truncated to ${limit} (max 200 via limit query param).`,
        timesSold:
          "Increments once per booking_products row or product_order_items row for this SKU — not bookings or orders.",
        averages: "averagePrice is totalRevenue ÷ totalQuantity for that product in this window.",
      },
      topProducts,
      totalProductsSold,
      totalRevenue,
      report_basis: reportBasis,
    });
  } catch (error) {
    console.error("Error in top products report:", error);
    return handleApiError(error, "Failed to generate top products report");
  }
}
