import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

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
    // Get products for this provider
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, name, category, retail_price, quantity, low_stock_level, track_stock_quantity, is_active')
      .eq('provider_id', providerId)
      .order('name', { ascending: true });

    if (productsError) {
      return handleApiError(
        new Error('Failed to fetch products'),
        'PRODUCTS_FETCH_ERROR',
        500
      );
    }

    // Calculate inventory metrics
    const totalProducts = products?.length || 0;
    const activeProducts = products?.filter((p) => p.is_active).length || 0;
    const inactiveProducts = totalProducts - activeProducts;
    const totalStockValue = products?.reduce((sum, p) => {
      const quantity = Number(p.quantity || 0);
      const price = Number(p.retail_price || 0);
      return sum + (quantity * price);
    }, 0) || 0;

    const lowStockProducts = products?.filter((p) => {
      if (!p.track_stock_quantity) return false;
      const quantity = Number(p.quantity || 0);
      const lowStockLevel = Number(p.low_stock_level || 5);
      return quantity > 0 && quantity <= lowStockLevel;
    }) || [];

    const outOfStockProducts = products?.filter((p) => {
      if (!p.track_stock_quantity) return false;
      const quantity = Number(p.quantity || 0);
      return quantity === 0;
    }) || [];

    // Group by category
    const categoryMap = new Map<string, { count: number; stockValue: number }>();
    products?.forEach((product) => {
      const category = product.category || "Uncategorized";
      const existing = categoryMap.get(category) || { count: 0, stockValue: 0 };
      existing.count += 1;
      const quantity = product.track_stock_quantity ? Number(product.quantity || 0) : 0;
      existing.stockValue += quantity * Number(product.retail_price || 0);
      categoryMap.set(category, existing);
    });

    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.stockValue - a.stockValue);

    return successResponse({
      totalProducts,
      activeProducts,
      inactiveProducts,
      totalStockValue,
      lowStockProducts: lowStockProducts.slice(0, 20),
      outOfStockProducts: outOfStockProducts.slice(0, 20),
      categoryBreakdown,
      allProducts: products || [],
    });
  } catch (error) {
    return handleApiError(error, "INVENTORY_ERROR", 500);
  }
}
