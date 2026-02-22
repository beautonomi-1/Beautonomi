import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";

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


    const { data: providerData, error: providerError } = await supabaseAdmin
      .from('providers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (providerError || !providerData?.id) {
      return handleApiError(
        new Error('Provider profile not found'),
        'NOT_FOUND',
        404
      );
    }
    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : subDays(new Date(), 30);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : new Date();

    // Get bookings with product sales in date range
    // Only include completed/confirmed bookings - cancelled/no_show shouldn't count as revenue
    // Also get sales (POS) with product sales
    const [bookingsResult, salesResult] = await Promise.all([
      supabaseAdmin
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
        .in('status', ['completed', 'confirmed', 'arrived', 'started'])
        .gte('scheduled_at', fromDate.toISOString())
        .lte('scheduled_at', toDate.toISOString()),
      supabaseAdmin
        .from('sales')
        .select(`
          id,
          sale_items (
            id,
            item_id,
            item_name,
            item_type,
            quantity,
            unit_price,
            total_price
          )
        `)
        .eq('provider_id', providerId)
        .eq('payment_status', 'completed')
        .gte('sale_date', fromDate.toISOString())
        .lte('sale_date', toDate.toISOString())
    ]);

    const { data: bookings, error: bookingsError } = bookingsResult;
    const { data: sales, error: salesError } = salesResult;

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

    // Get product details for sale items
    const saleItemProductIds = new Set<string>();
    (sales || []).forEach((sale: any) => {
      if (sale.sale_items && Array.isArray(sale.sale_items)) {
        sale.sale_items.forEach((item: any) => {
          if (item.item_type === 'product' && item.item_id) {
            saleItemProductIds.add(item.item_id);
          }
        });
      }
    });

    const productMap = new Map<string, { name: string; category: string; supplyPrice: number }>();
    if (saleItemProductIds.size > 0) {
      const { data: productsData } = await supabaseAdmin
        .from('products')
        .select('id, name, category, supply_price')
        .in('id', Array.from(saleItemProductIds));
      
      productsData?.forEach((p: any) => {
        productMap.set(p.id, {
          name: p.name || 'Unknown',
          category: p.category || 'Uncategorized',
          supplyPrice: Number(p.supply_price || 0),
        });
      });
    }

    // Process sales (POS) products
    // Revenue: use total_price (line total) when available, else quantity * unit_price
    (sales || []).forEach((sale: any) => {
      if (!sale.sale_items || !Array.isArray(sale.sale_items)) {
        return;
      }
      
      sale.sale_items.forEach((item: any) => {
        // Only process product items (not services)
        if (item.item_type !== 'product' || !item.item_id) {
          return;
        }
        
        const productId = item.item_id;
        const productInfo = productMap.get(productId);
        const productName = productInfo?.name || item.item_name || 'Unknown Product';
        const category = productInfo?.category || 'Uncategorized';
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unit_price || 0);
        const totalPrice = Number(item.total_price || 0);
        // Use total_price directly (line total) - avoids undercounting when unit_price is 0
        const revenue = totalPrice > 0 ? totalPrice : quantity * unitPrice;
        const supplyPrice = productInfo?.supplyPrice ?? 0;
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
    });
  } catch (error) {
    console.error("Error in product sales report:", error);
    return handleApiError(error, "Failed to generate product sales report");
  }
}
