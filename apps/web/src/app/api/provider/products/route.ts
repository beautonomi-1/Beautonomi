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
      .select("*, product_variants(*)", { count: 'exact' })
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    // Apply search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: productsRaw, error, count } = await query;

    if (error) {
      throw error;
    }

    // Normalize: Supabase returns product_variants as array; ensure variants sorted by sort_order
    const products = (productsRaw || []).map((p: any) => {
      const variants = (p.product_variants || []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const { product_variants: _, ...rest } = p;
      const hasV = Boolean(rest.has_variants && variants.length > 0);
      const effective_quantity = hasV
        ? variants.reduce((sum: number, v: any) => sum + (Number(v.quantity) || 0), 0)
        : Number(rest.quantity) || 0;
      return { ...rest, variants, effective_quantity };
    });

    const totalPages = count ? Math.ceil(count / limit) : 1;

    return successResponse({
      products,
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
      has_variants,
      variant_option_types,
      variants: variantsPayload,
    } = body;

    if (!name) {
      return handleApiError(new Error("name is required"), "Validation failed", "VALIDATION_ERROR", 400);
    }
    const withVariants = Boolean(has_variants && Array.isArray(variantsPayload) && variantsPayload.length > 0);
    if (!withVariants && retail_price === undefined) {
      return handleApiError(new Error("retail_price is required for products without variants"), "Validation failed", "VALIDATION_ERROR", 400);
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Generate SKU for simple product if not provided
    let finalSku = sku;
    if (!withVariants && !finalSku) {
      const providerShort = providerId.substring(0, 4).toUpperCase();
      const timestamp = Date.now().toString().slice(-6);
      finalSku = `PROD-${providerShort}-${timestamp}`;
      let counter = 1;
      while (true) {
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("provider_id", providerId)
          .eq("sku", finalSku)
          .single();
        if (!existing) break;
        finalSku = `PROD-${providerShort}-${timestamp}-${counter}`;
        counter++;
      }
    }

    const { data: product, error } = await supabase
      .from("products")
      .insert({
        provider_id: providerId,
        name,
        barcode: withVariants ? null : (barcode || null),
        brand: brand || null,
        measure: withVariants ? null : (measure || null),
        amount: withVariants ? null : (amount || null),
        short_description: short_description || null,
        description: description || null,
        category: category || null,
        supplier: supplier || null,
        sku: withVariants ? null : (finalSku || null),
        quantity: withVariants ? 0 : (quantity ?? 0),
        low_stock_level: withVariants ? 5 : (low_stock_level ?? 5),
        reorder_quantity: reorder_quantity ?? 0,
        supply_price: withVariants ? 0 : (supply_price ?? 0),
        retail_price: withVariants ? 0 : parseFloat(String(retail_price)),
        retail_sales_enabled: retail_sales_enabled ?? true,
        markup: withVariants ? null : (markup ?? null),
        tax_rate: tax_rate ?? 0,
        team_member_commission_enabled: team_member_commission_enabled ?? false,
        track_stock_quantity: track_stock_quantity ?? true,
        receive_low_stock_notifications: receive_low_stock_notifications ?? false,
        image_urls: image_urls || [],
        is_active: is_active ?? true,
        has_variants: withVariants,
        variant_option_types: withVariants ? (variant_option_types || []) : [],
      })
      .select()
      .single();

    if (error || !product) {
      throw error || new Error("Failed to create product");
    }

    if (withVariants && variantsPayload?.length) {
      const providerShort = providerId.substring(0, 4).toUpperCase();
      const baseTs = Date.now().toString().slice(-6);
      const variantRows = variantsPayload.map((v: any, idx: number) => {
        const vSku = v.sku || `PROD-${providerShort}-${baseTs}-V${idx + 1}`;
        return {
          product_id: product.id,
          option_values: v.option_values || {},
          sort_order: v.sort_order ?? idx,
          sku: vSku,
          barcode: v.barcode || null,
          measure: v.measure || null,
          amount: v.amount ?? null,
          quantity: v.quantity ?? 0,
          low_stock_level: v.low_stock_level ?? 5,
          reorder_quantity: v.reorder_quantity ?? 0,
          supply_price: v.supply_price ?? 0,
          retail_price: parseFloat(String(v.retail_price ?? 0)),
          markup: v.markup ?? null,
          image_url: v.image_url || null,
        };
      });
      const { error: varErr } = await supabase.from("product_variants").insert(variantRows);
      if (varErr) throw varErr;
    }

    const { data: withVariantsData } = await supabase
      .from("products")
      .select("*, product_variants(*)")
      .eq("id", product.id)
      .single();
    const out = withVariantsData || product;
    const variants = (out as any).product_variants || [];
    const { product_variants: _, ...rest } = out as any;
    return successResponse({ ...rest, variants: variants.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) });
  } catch (error) {
    return handleApiError(error, "Failed to create product");
  }
}
