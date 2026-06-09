import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeOrderSourceBreakdown } from "@/lib/reports/booking-channel-breakdown";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import {
  filterProductOrdersForLocation,
  getProviderReportContext,
  reportDateRangeFromParams,
  type LocationLinkedProductOrderRow,
} from "@/lib/reports/provider-report-utils";

/** Full row from product_orders select — passed through location filter without stripping nested items */
type ProductOrderSalesRow = LocationLinkedProductOrderRow & {
  order_source?: string | null;
  product_order_items?: unknown;
};

type AggRow = {
  productId: string;
  productName: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
  prices: number[];
};

/**
 * GET /api/provider/reports/products/sales
 *
 * Retail product line revenue from:
 * - **booking_products** on appointments in range (`bookings.scheduled_at`), statuses that reflect real visits.
 * - **paid product_orders** (non–appointment-mirror) in range (`product_orders.created_at`).
 *
 * Cost/profit use `products.supply_price × quantity` when supply_price is set.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate, fromYmd, toYmd } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(`
          id,
          booking_products (
            id,
            product_id,
            quantity,
            unit_price,
            total_price,
            products (
              id,
              name,
              category,
              supply_price
            )
          )
        `)
      .eq("provider_id", providerId)
      .in("status", ["completed", "confirmed", "in_progress", "checked_in"])
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    let salesQuery = supabaseAdmin
      .from("product_orders")
      .select(`
          id,
          fulfillment_type,
          collection_location_id,
          order_source,
          product_order_items (
            id,
            product_id,
            product_name,
            quantity,
            unit_price,
            total_price,
            products (
              id,
              name,
              category,
              supply_price
            )
          )
        `)
      .eq("provider_id", providerId)
      .eq("payment_status", "paid")
      .or("order_source.is.null,order_source.neq.appointment")
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());

    const [bookingsResult, salesResult] = await Promise.all([bookingsQuery, salesQuery]);

    const { data: bookings, error: bookingsError } = bookingsResult;
    const { data: salesRaw, error: salesError } = salesResult;

    if (bookingsError && !bookingsError.message.includes("booking_products")) {
      console.error("Error fetching bookings:", bookingsError);
    }
    if (salesError && !salesError.message.includes("sale_items")) {
      console.error("Error fetching sales:", salesError);
    }

    const sales = await filterProductOrdersForLocation<ProductOrderSalesRow>(
      supabaseAdmin,
      providerId,
      (salesRaw || []) as ProductOrderSalesRow[],
      locationId,
    );

    const productSalesMap = new Map<string, AggRow>();
    const categoryMap = new Map<string, { quantitySold: number; revenue: number; cost: number; profit: number }>();

    let unitsFromBookings = 0;
    let revenueFromBookings = 0;
    let costFromBookings = 0;

    let unitsFromOrders = 0;
    let revenueFromOrders = 0;
    let costFromOrders = 0;
    const retailChannelOrders: { order_source?: string | null; units: number; revenue: number }[] = [];

    const pushBookingLine = (bp: any) => {
      const productId = bp.product_id;
      const productName = bp.products?.name || "Unknown Product";
      const category = bp.products?.category || "Uncategorized";
      const quantity = Number(bp.quantity || 0);
      const unitPrice = Number(bp.unit_price || 0);
      const totalPrice = Number(bp.total_price || 0);
      const revenue = totalPrice > 0 ? totalPrice : quantity * unitPrice;
      const supplyPrice = Number(bp.products?.supply_price || 0);
      const cost = quantity * supplyPrice;
      const profit = revenue - cost;

      unitsFromBookings += quantity;
      revenueFromBookings += revenue;
      costFromBookings += cost;

      const existing = productSalesMap.get(productId) || {
        productId,
        productName,
        quantitySold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        prices: [],
      };
      existing.quantitySold += quantity;
      existing.revenue += revenue;
      existing.cost += cost;
      existing.profit += profit;
      existing.prices.push(unitPrice || (quantity > 0 ? revenue / quantity : 0));
      productSalesMap.set(productId, existing);

      const catExisting = categoryMap.get(category) || {
        quantitySold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };
      catExisting.quantitySold += quantity;
      catExisting.revenue += revenue;
      catExisting.cost += cost;
      catExisting.profit += profit;
      categoryMap.set(category, catExisting);
    };

    const pushOrderLine = (item: any) => {
      const productId = item.product_id;
      const productName = item.products?.name || item.product_name || "Unknown Product";
      const category = item.products?.category || "Uncategorized";
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      const totalPrice = Number(item.total_price || 0);
      const revenue = totalPrice > 0 ? totalPrice : quantity * unitPrice;
      const supplyPrice = Number(item.products?.supply_price || 0);
      const cost = quantity * supplyPrice;
      const profit = revenue - cost;

      unitsFromOrders += quantity;
      revenueFromOrders += revenue;
      costFromOrders += cost;

      const existing = productSalesMap.get(productId) || {
        productId,
        productName,
        quantitySold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        prices: [],
      };
      existing.quantitySold += quantity;
      existing.revenue += revenue;
      existing.cost += cost;
      existing.profit += profit;
      existing.prices.push(unitPrice || (quantity > 0 ? revenue / quantity : 0));
      productSalesMap.set(productId, existing);

      const catExisting = categoryMap.get(category) || {
        quantitySold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };
      catExisting.quantitySold += quantity;
      catExisting.revenue += revenue;
      catExisting.cost += cost;
      catExisting.profit += profit;
      categoryMap.set(category, catExisting);
    };

    (bookings || []).forEach((booking: { booking_products?: unknown }) => {
      if (!booking.booking_products || !Array.isArray(booking.booking_products)) return;
      booking.booking_products.forEach((bp: unknown) => pushBookingLine(bp));
    });

    (sales || []).forEach((sale) => {
      if (!sale.product_order_items || !Array.isArray(sale.product_order_items)) return;
      let orderUnits = 0;
      let orderRevenue = 0;
      sale.product_order_items.forEach((item: unknown) => {
        const quantity = Number((item as { quantity?: number }).quantity || 0);
        const unitPrice = Number((item as { unit_price?: number }).unit_price || 0);
        const totalPrice = Number((item as { total_price?: number }).total_price || 0);
        const lineRevenue = totalPrice > 0 ? totalPrice : quantity * unitPrice;
        orderUnits += quantity;
        orderRevenue += lineRevenue;
        pushOrderLine(item);
      });
      retailChannelOrders.push({
        order_source: sale.order_source,
        units: orderUnits,
        revenue: orderRevenue,
      });
    });

    const by_channel = computeOrderSourceBreakdown({ orders: retailChannelOrders });

    const totalProductsSold = Array.from(productSalesMap.values()).reduce((sum, p) => sum + p.quantitySold, 0);
    const totalRevenue = Array.from(productSalesMap.values()).reduce((sum, p) => sum + p.revenue, 0);
    const totalCost = Array.from(productSalesMap.values()).reduce((sum, p) => sum + p.cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const averageRevenuePerUnitSold = totalProductsSold > 0 ? totalRevenue / totalProductsSold : 0;

    const topProducts = Array.from(productSalesMap.values())
      .map((product) => ({
        productId: product.productId,
        productName: product.productName,
        quantitySold: product.quantitySold,
        revenue: product.revenue,
        cost: product.cost,
        profit: product.profit,
        averagePrice:
          product.prices.length > 0
            ? product.prices.reduce((sum, pr) => sum + pr, 0) / product.prices.length
            : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const productsByCategory = Array.from(categoryMap.entries())
      .map(([category, d]) => ({
        category,
        quantitySold: d.quantitySold,
        revenue: d.revenue,
        cost: d.cost,
        profit: d.profit,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const reportBasis =
      `Period ${fromYmd}–${toYmd} (${reportContext.timezone}). Two date bases are combined: ` +
      `appointment add-ons use bookings with scheduled_at in range and status in completed, confirmed, in_progress, checked_in; ` +
      `standalone retail uses paid product_orders with created_at in range. ` +
      `Orders with order_source=appointment are excluded here because their lines are represented on booking_products. ` +
      `Line revenue uses total_price when present, else quantity × unit_price. Cost uses supply_price × quantity when the product has supply_price.`;

    return successResponse({
      timezone: reportContext.timezone,
      fromYmd,
      toYmd,
      reportBasis,
      basis: {
        bookingLines:
          "booking_products on appointments whose scheduled_at falls in the window (location applies to the booking when filtered).",
        orderLines:
          "product_order_items on paid orders whose created_at falls in the window; appointment-mirror orders excluded.",
        profit: "Revenue minus Σ (supply_price × qty) where supply_price is stored on the product.",
        topProducts: "Top 10 products by aggregated line revenue in this period.",
        averageRevenuePerUnit:
          "totalRevenue ÷ total units sold across both sources (not an average per distinct SKU count).",
      },
      unitsFromBookings,
      revenueFromBookings,
      costFromBookings,
      unitsFromOrders,
      revenueFromOrders,
      costFromOrders,
      by_channel,
      totalProductsSold,
      totalRevenue,
      totalCost,
      totalProfit,
      averageProductValue: averageRevenuePerUnitSold,
      averageRevenuePerUnitSold,
      topProducts,
      productsByCategory,
      /** @deprecated use reportBasis */
      report_basis: reportBasis,
    });
  } catch (error) {
    console.error("Error in product sales report:", error);
    return handleApiError(error, "Failed to generate product sales report");
  }
}
