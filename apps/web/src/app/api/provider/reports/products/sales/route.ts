import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { filterProductOrdersForLocation } from "@/lib/reports/provider-report-utils";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");


    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get("from")
      ? startOfDay(new Date(searchParams.get("from")!))
      : startOfDay(subDays(new Date(), 30));
    const toDate = searchParams.get("to")
      ? endOfDay(new Date(searchParams.get("to")!))
      : endOfDay(new Date());
    const locationId = searchParams.get("location_id") || undefined;

    // Get bookings with product add-ons and paid product orders in date range.
    // Product orders cover online product checkout and provider walk-in/new-sale flows.
    let bookingsQuery = supabaseAdmin
      .from('bookings')
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
      .eq('provider_id', providerId)
      // §Release-audit 2026-04: previous list included 'arrived' and
      // 'started', which are not members of the booking_status enum — the
      // Postgres in-clause silently excluded them, so mid-service product
      // usage never showed up in sales reports. Use the real lifecycle
      // states that indicate the booking actually happened.
      .in('status', ['completed', 'confirmed', 'in_progress', 'checked_in'])
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString());

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    let salesQuery = supabaseAdmin
      .from('product_orders')
      .select(`
          id,
          fulfillment_type,
          collection_location_id,
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
      .eq('provider_id', providerId)
      .eq('payment_status', 'paid')
      // Appointment product orders are fulfillment mirrors. Their revenue is
      // counted from booking_products above, so exclude them here.
      .or('order_source.is.null,order_source.neq.appointment')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString());

    const [bookingsResult, salesResult] = await Promise.all([
      bookingsQuery,
      salesQuery,
    ]);

    const { data: bookings, error: bookingsError } = bookingsResult;
    const { data: salesRaw, error: salesError } = salesResult;
    const sales = await filterProductOrdersForLocation(
      supabaseAdmin,
      providerId,
      (salesRaw || []) as Array<{ id: string; fulfillment_type?: string | null; collection_location_id?: string | null }>,
      locationId,
    );

    // Handle errors gracefully
    if (bookingsError && !bookingsError.message.includes('booking_products')) {
      console.error("Error fetching bookings:", bookingsError);
    }
    if (salesError && !salesError.message.includes('sale_items')) {
      console.error("Error fetching sales:", salesError);
    }

    // Aggregate product sales (revenue + profit)
    const productSalesMap = new Map<string, {
      productId: string;
      productName: string;
      quantitySold: number;
      revenue: number;
      cost: number;
      profit: number;
      prices: number[];
    }>();

    const categoryMap = new Map<string, { quantitySold: number; revenue: number; cost: number; profit: number }>();

    // Process booking products
    // Revenue: use total_price (line total) when available, else quantity * unit_price
    // Per schema: total_price = unit_price * quantity
    (bookings || []).forEach((booking: any) => {
      if (!booking.booking_products || !Array.isArray(booking.booking_products)) {
        return;
      }
      
      booking.booking_products.forEach((bp: any) => {
        const productId = bp.product_id;
        const productName = bp.products?.name || 'Unknown Product';
        const category = bp.products?.category || 'Uncategorized';
        const quantity = Number(bp.quantity || 0);
        const unitPrice = Number(bp.unit_price || 0);
        const totalPrice = Number(bp.total_price || 0);
        // Use total_price directly (line total) - multiplying by quantity when total_price exists would double-count
        const revenue = totalPrice > 0 ? totalPrice : quantity * unitPrice;
        const supplyPrice = Number(bp.products?.supply_price || 0);
        const cost = quantity * supplyPrice;
        const profit = revenue - cost;

        // Track by product
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

        // Track by category
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
      });
    });

    // Process product orders (online checkout + walk-in/new sale) products
    // Revenue: use total_price (line total) when available, else quantity * unit_price
    (sales || []).forEach((sale: any) => {
      if (!sale.product_order_items || !Array.isArray(sale.product_order_items)) {
        return;
      }
      
      sale.product_order_items.forEach((item: any) => {
        const productId = item.product_id;
        const productName = item.products?.name || item.product_name || 'Unknown Product';
        const category = item.products?.category || 'Uncategorized';
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unit_price || 0);
        const totalPrice = Number(item.total_price || 0);
        // Use total_price directly (line total) - avoids undercounting when unit_price is 0
        const revenue = totalPrice > 0 ? totalPrice : quantity * unitPrice;
        const supplyPrice = Number(item.products?.supply_price || 0);
        const cost = quantity * supplyPrice;
        const profit = revenue - cost;

        // Track by product
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

        // Track by category
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
      });
    });

    const totalProductsSold = Array.from(productSalesMap.values())
      .reduce((sum, p) => sum + p.quantitySold, 0);
    const totalRevenue = Array.from(productSalesMap.values())
      .reduce((sum, p) => sum + p.revenue, 0);
    const totalCost = Array.from(productSalesMap.values())
      .reduce((sum, p) => sum + p.cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const averageProductValue = totalProductsSold > 0 ? totalRevenue / totalProductsSold : 0;

    const topProducts = Array.from(productSalesMap.values())
      .map((product) => ({
        productId: product.productId,
        productName: product.productName,
        quantitySold: product.quantitySold,
        revenue: product.revenue,
        cost: product.cost,
        profit: product.profit,
        averagePrice: product.prices.length > 0
          ? product.prices.reduce((sum, p) => sum + p, 0) / product.prices.length
          : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const productsByCategory = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        quantitySold: data.quantitySold,
        revenue: data.revenue,
        cost: data.cost,
        profit: data.profit,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return successResponse({
      totalProductsSold,
      totalRevenue,
      totalCost,
      totalProfit,
      averageProductValue,
      topProducts,
      productsByCategory,
      report_basis:
        "Product sales include appointment booking_products and standalone paid product_orders by scheduled/order date. Appointment product_orders are excluded as fulfillment mirrors.",
    });
  } catch (error) {
    console.error("Error in product sales report:", error);
    return handleApiError(error, "Failed to generate product sales report");
  }
}
