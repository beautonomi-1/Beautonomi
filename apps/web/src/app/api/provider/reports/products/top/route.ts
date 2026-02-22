import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";

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
      ? new Date(searchParams.get("from")!)
      : subDays(new Date(), 30);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : new Date();
    const limit = parseInt(searchParams.get("limit") || "20");

    // Get bookings and sales
    const [bookingsResult, salesResult] = await Promise.all([
      supabaseAdmin
        .from('bookings')
        .select('id, scheduled_at')
        .eq('provider_id', providerId)
        .gte('scheduled_at', fromDate.toISOString())
        .lte('scheduled_at', toDate.toISOString()),
      supabaseAdmin
        .from('sales')
        .select('id, sale_date')
        .eq('provider_id', providerId)
        // sales table uses 'completed' for paid (canonical: see lib/utils/payment-status.ts)
        .eq('payment_status', 'completed')
        .gte('sale_date', fromDate.toISOString())
        .lte('sale_date', toDate.toISOString())
    ]);

    const { data: bookings } = bookingsResult;
    const { data: sales } = salesResult;
    const bookingIds = bookings?.map((b) => b.id) || [];
    const saleIds = sales?.map((s) => s.id) || [];

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

    // Get sale_items (POS products)
    let saleItemsQuery = supabaseAdmin
      .from('sale_items')
      .select(`
        id,
        item_id,
        item_name,
        item_type,
        quantity,
        unit_price,
        total_price
      `)
      .eq('item_type', 'product');

    if (saleIds.length > 0) {
      saleItemsQuery = saleItemsQuery.in('sale_id', saleIds);
    } else {
      saleItemsQuery = saleItemsQuery.eq('sale_id', '00000000-0000-0000-0000-000000000000');
    }

    const { data: saleItems, error: saleItemsError } = await saleItemsQuery;

    // Get product details for sale items
    const saleItemProductIds = new Set<string>();
    saleItems?.forEach((item: any) => {
      if (item.item_id) {
        saleItemProductIds.add(item.item_id);
      }
    });

    const saleItemProductMap = new Map<string, { name: string; category: string; retail_price: number }>();
    if (saleItemProductIds.size > 0) {
      const { data: productsData } = await supabaseAdmin
        .from('products')
        .select('id, name, category, retail_price')
        .in('id', Array.from(saleItemProductIds));
      
      productsData?.forEach((p: any) => {
        saleItemProductMap.set(p.id, {
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
    if (saleItemsError && !saleItemsError.message.includes('sale_items')) {
      console.error("Error fetching sale items:", saleItemsError);
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
      const price = Number(bp.unit_price || bp.total_price || product.retail_price || 0);

      existing.totalQuantity += quantity;
      existing.totalRevenue += price * quantity;
      existing.timesSold += 1;
      productMap.set(productId, existing);
    });

    // Process sale items (POS products)
    saleItems?.forEach((item: any) => {
      if (!item.item_id) return; // Skip if no product ID

      const productInfo = saleItemProductMap.get(item.item_id);
      const productId = item.item_id;
      const existing = productMap.get(productId) || {
        productId,
        productName: productInfo?.name || item.item_name || "Unknown",
        category: productInfo?.category || "Uncategorized",
        totalQuantity: 0,
        totalRevenue: 0,
        averagePrice: 0,
        timesSold: 0,
      };

      const quantity = Number(item.quantity || 1);
      const price = Number(item.unit_price || item.total_price || productInfo?.retail_price || 0);

      existing.totalQuantity += quantity;
      existing.totalRevenue += price * quantity;
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

    const totalProductsSold = topProducts.reduce((sum, p) => sum + p.totalQuantity, 0);
    const totalRevenue = topProducts.reduce((sum, p) => sum + p.totalRevenue, 0);

    return successResponse({
      topProducts,
      totalProductsSold,
      totalRevenue,
    });
  } catch (error) {
    return handleApiError(error, "TOP_PRODUCTS_ERROR", 500);
  }
}
