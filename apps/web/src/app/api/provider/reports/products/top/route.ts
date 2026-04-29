import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { endOfDay, startOfDay, subDays } from "date-fns";

function lineRevenue(qty: number, unitPrice: number, totalPrice: number): number {
  const total = Number(totalPrice) || 0;
  if (total > 0) return total;
  return qty * (Number(unitPrice) || 0);
}

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const providerId = user.role === 'superadmin'
      ? request.nextUrl.searchParams.get('provider_id')
      : await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) {
      return handleApiError(
        new Error('Provider profile not found'),
        'NOT_FOUND',
        404
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get("from")
      ? startOfDay(new Date(searchParams.get("from")!))
      : startOfDay(subDays(new Date(), 30));
    const toDate = searchParams.get("to")
      ? endOfDay(new Date(searchParams.get("to")!))
      : endOfDay(new Date());
    const limit = parseInt(searchParams.get("limit") || "20");
    const locationId = searchParams.get("location_id") || undefined;

    // Get booking-attached products and standalone paid product orders.
    let bookingsQuery = supabaseAdmin
      .from('bookings')
      .select('id, scheduled_at')
      .eq('provider_id', providerId)
      .in("status", ["completed", "confirmed", "in_progress", "checked_in"])
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString());

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    let ordersQuery = supabaseAdmin
      .from("product_orders")
      .select("id, created_at")
      .eq("provider_id", providerId)
      .eq("payment_status", "paid")
      .or("order_source.is.null,order_source.neq.appointment")
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());

    if (locationId) {
      ordersQuery = ordersQuery.eq("collection_location_id", locationId);
    }

    const [bookingsResult, ordersResult] = await Promise.all([
      bookingsQuery,
      ordersQuery,
    ]);

    const { data: bookings } = bookingsResult;
    const { data: orders } = ordersResult;
    const bookingIds = bookings?.map((b) => b.id) || [];
    const orderIds = orders?.map((s) => s.id) || [];

    // Get booking_products
    let bookingProductsQuery = supabaseAdmin
      .from('booking_products')
      .select(`
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
      bookingProductsQuery = bookingProductsQuery.in('booking_id', bookingIds);
    } else {
      bookingProductsQuery = bookingProductsQuery.eq('booking_id', '00000000-0000-0000-0000-000000000000');
    }

    const { data: bookingProducts, error: bookingProductsError } = await bookingProductsQuery;

    // Get standalone product_order_items (online/walk-in product orders).
    let orderItemsQuery = supabaseAdmin
      .from("product_order_items")
      .select(`
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

    // Get product details for standalone order items
    const orderItemProductIds = new Set<string>();
    orderItems?.forEach((item: any) => {
      if (item.product_id) {
        orderItemProductIds.add(item.product_id);
      }
    });

    const orderItemProductMap = new Map<string, { name: string; category: string; retail_price: number }>();
    if (orderItemProductIds.size > 0) {
      const { data: productsData } = await supabaseAdmin
        .from('products')
        .select('id, name, category, retail_price')
        .in('id', Array.from(orderItemProductIds));
      
      productsData?.forEach((p: any) => {
        orderItemProductMap.set(p.id, {
          name: p.name || 'Unknown',
          category: p.category || 'Uncategorized',
          retail_price: Number(p.retail_price || 0)
        });
      });
    }

    // Handle errors gracefully
    if (bookingProductsError && !bookingProductsError.message.includes('booking_products')) {
      console.error("Error fetching booking products:", bookingProductsError);
    }
    if (orderItemsError) {
      console.error("Error fetching product order items:", orderItemsError);
    }

    // Aggregate by product
    const productMap = new Map<string, {
      productId: string;
      productName: string;
      category: string;
      totalQuantity: number;
      totalRevenue: number;
      averagePrice: number;
      timesSold: number;
    }>();

    // Process booking products
    bookingProducts?.forEach((bp: any) => {
      const product = bp.products;
      if (!product) return;

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

    // Process standalone order items
    orderItems?.forEach((item: any) => {
      if (!item.product_id) return;

      const productInfo = orderItemProductMap.get(item.product_id);
      const productId = item.product_id;
      const existing = productMap.get(productId) || {
        productId,
        productName: productInfo?.name || item.product_name || "Unknown",
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

    return successResponse({
      topProducts,
      totalProductsSold,
      totalRevenue,
      reportBasis:
        "Top products include appointment booking_products and standalone paid product_orders. Appointment product_orders are excluded as fulfillment mirrors.",
    });
  } catch (error) {
    return handleApiError(error, "TOP_PRODUCTS_ERROR", 500);
  }
}
