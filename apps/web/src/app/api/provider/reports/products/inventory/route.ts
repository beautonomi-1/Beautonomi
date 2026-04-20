import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import {
  displayRetailPriceMin,
  effectiveStockQuantity,
  retailStockValue,
} from "@/lib/provider-portal/product-inventory-metrics";

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
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, name, category, retail_price, quantity, low_stock_level, track_stock_quantity, is_active, has_variants, product_variants(quantity, retail_price)')
      .eq('provider_id', providerId)
      .order('name', { ascending: true });

    if (productsError) {
      return handleApiError(
        new Error('Failed to fetch products'),
        'PRODUCTS_FETCH_ERROR',
        500
      );
    }

    const rows = products || [];

    const shapeRow = (p: (typeof rows)[number]) => {
      const stock_quantity = effectiveStockQuantity(p);
      const price = displayRetailPriceMin(p);
      const retail_line_value = retailStockValue(p);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        has_variants: Boolean(p.has_variants),
        is_active: p.is_active,
        track_stock_quantity: p.track_stock_quantity,
        low_stock_level: p.low_stock_level,
        quantity: stock_quantity,
        stock_quantity,
        price,
        retail_price: price,
        retail_line_value,
      };
    };

    const totalProducts = rows.length;
    const activeProducts = rows.filter((p) => p.is_active).length;
    const inactiveProducts = totalProducts - activeProducts;
    const totalStockValue = rows.reduce((sum, p) => sum + retailStockValue(p), 0);

    const lowStockProducts = rows
      .filter((p) => {
        if (p.track_stock_quantity === false) return false;
        const q = effectiveStockQuantity(p);
        const lowStockLevel = Number(p.low_stock_level || 5);
        return q > 0 && q <= lowStockLevel;
      })
      .map(shapeRow);

    const outOfStockProducts = rows
      .filter((p) => {
        if (p.track_stock_quantity === false) return false;
        return effectiveStockQuantity(p) === 0;
      })
      .map(shapeRow);

    const categoryMap = new Map<string, { count: number; stockValue: number }>();
    rows.forEach((product) => {
      const category = product.category || "Uncategorized";
      const existing = categoryMap.get(category) || { count: 0, stockValue: 0 };
      existing.count += 1;
      existing.stockValue += retailStockValue(product);
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
      allProducts: rows.map(shapeRow),
    });
  } catch (error) {
    return handleApiError(error, "INVENTORY_ERROR", 500);
  }
}
