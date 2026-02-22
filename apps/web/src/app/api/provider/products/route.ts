import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError, requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/products
 * 
 * Get provider's products
 */
export async function GET(request: Request) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const offset = (page - 1) * limit;

    let query = supabase
      .from("products")
      .select("*", { count: 'exact' })
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    // Apply search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: products, error, count } = await query;

    if (error) {
      throw error;
    }

    const totalPages = count ? Math.ceil(count / limit) : 1;

    return successResponse({
      products: products || [],
      total: count || 0,
      page,
      limit,
      total_pages: totalPages,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch products");
  }
}

/**
 * POST /api/provider/products
 * 
 * Create a new product
 */
export async function POST(request: Request) {
  try {
    // Check permission to edit products
    const permissionCheck = await requirePermission('edit_products', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const {
      name,
      barcode,
      brand,
      measure,
      amount,
      short_description,
      description,
      category,
      supplier,
      sku,
      quantity,
      low_stock_level,
      reorder_quantity,
      supply_price,
      retail_price,
      retail_sales_enabled,
      markup,
      tax_rate,
      team_member_commission_enabled,
      track_stock_quantity,
      receive_low_stock_notifications,
      image_urls,
      is_active,
    } = body;

    if (!name || retail_price === undefined) {
      return handleApiError(new Error("name and retail_price are required"), "Validation failed", "VALIDATION_ERROR", 400);
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Generate SKU if not provided
    let finalSku = sku;
    if (!finalSku) {
      // Generate SKU: PROD-{provider_id first 4 chars}-{timestamp last 6 digits}
      const providerShort = providerId.substring(0, 4).toUpperCase();
      const timestamp = Date.now().toString().slice(-6);
      finalSku = `PROD-${providerShort}-${timestamp}`;
      
      // Ensure uniqueness
      let counter = 1;
      while (true) {
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("provider_id", providerId)
          .eq("sku", finalSku)
          .single();
        
        if (!existing) {
          break;
        }
        finalSku = `PROD-${providerShort}-${timestamp}-${counter}`;
        counter++;
      }
    }

    const { data: product, error } = await supabase
      .from("products")
      .insert({
        provider_id: providerId,
        name,
        barcode: barcode || null,
        brand: brand || null,
        measure: measure || null,
        amount: amount || null,
        short_description: short_description || null,
        description: description || null,
        category: category || null,
        supplier: supplier || null,
        sku: finalSku,
        quantity: quantity || 0,
        low_stock_level: low_stock_level || 5,
        reorder_quantity: reorder_quantity || 0,
        supply_price: supply_price || 0,
        retail_price: parseFloat(retail_price),
        retail_sales_enabled: retail_sales_enabled ?? true,
        markup: markup || null,
        tax_rate: tax_rate || 0,
        team_member_commission_enabled: team_member_commission_enabled ?? false,
        track_stock_quantity: track_stock_quantity ?? true,
        receive_low_stock_notifications: receive_low_stock_notifications ?? false,
        image_urls: image_urls || [],
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error || !product) {
      throw error || new Error("Failed to create product");
    }

    return successResponse(product);
  } catch (error) {
    return handleApiError(error, "Failed to create product");
  }
}
