import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError, requireRoleInApi, getProviderIdForUser, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { logStockChangeFromAbsoluteQuantity } from "@/lib/products/stock-movements";

/**
 * GET /api/provider/products/[id]
 * 
 * Get a specific product
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: productRaw, error } = await supabase
      .from("products")
      .select("*, product_variants(*)")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !productRaw) {
      return notFoundResponse("Product not found");
    }

    const variants = ((productRaw as any).product_variants || []).sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    const { product_variants: _, ...product } = productRaw as any;
    return successResponse({ ...product, variants });
  } catch (error) {
    return handleApiError(error, "Failed to fetch product");
  }
}

/** Shared update logic for PATCH and PUT */
async function updateProductHandler(
  request: Request,
  params: Promise<{ id: string }>
) {
  const permissionCheck = await requirePermission("edit_products", request);
  if (!permissionCheck.authorized) {
    return permissionCheck.response!;
  }
  const { user } = permissionCheck;
  const supabase = await getSupabaseServer(request);
  const { id } = await params;
  const body = await request.json();

  const providerId = await getProviderIdForUser(user.id, supabase);
  if (!providerId) {
    return notFoundResponse("Provider not found");
  }

  const { data: existingProduct } = await supabase
    .from("products")
    .select("id, quantity, has_variants")
    .eq("id", id)
    .eq("provider_id", providerId)
    .single();

  if (!existingProduct) {
    return notFoundResponse("Product not found");
  }

  const previousQuantity = Number((existingProduct as { quantity?: number }).quantity) || 0;

  const updateData: Record<string, any> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.barcode !== undefined) updateData.barcode = body.barcode;
  if (body.brand !== undefined) updateData.brand = body.brand;
  if (body.measure !== undefined) updateData.measure = body.measure;
  if (body.amount !== undefined) updateData.amount = body.amount;
  if (body.short_description !== undefined) updateData.short_description = body.short_description;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.supplier !== undefined) updateData.supplier = body.supplier;
  if (body.sku !== undefined) updateData.sku = body.sku;
  if (body.quantity !== undefined) updateData.quantity = parseInt(String(body.quantity), 10);
  if (body.low_stock_level !== undefined) updateData.low_stock_level = parseInt(String(body.low_stock_level), 10);
  if (body.reorder_quantity !== undefined) updateData.reorder_quantity = parseInt(String(body.reorder_quantity), 10);
  if (body.supply_price !== undefined) updateData.supply_price = parseFloat(String(body.supply_price));
  if (body.retail_price !== undefined) updateData.retail_price = parseFloat(String(body.retail_price));
  if (body.retail_sales_enabled !== undefined) updateData.retail_sales_enabled = body.retail_sales_enabled;
  if (body.markup !== undefined) updateData.markup = body.markup;
  if (body.tax_rate !== undefined) updateData.tax_rate = parseFloat(String(body.tax_rate));
  if (body.team_member_commission_enabled !== undefined) updateData.team_member_commission_enabled = body.team_member_commission_enabled;
  if (body.track_stock_quantity !== undefined) updateData.track_stock_quantity = body.track_stock_quantity;
  if (body.receive_low_stock_notifications !== undefined) updateData.receive_low_stock_notifications = body.receive_low_stock_notifications;
  if (body.image_urls !== undefined) updateData.image_urls = body.image_urls;
  if (body.is_active !== undefined) updateData.is_active = body.is_active;
  if (body.has_variants !== undefined) updateData.has_variants = body.has_variants;
  if (body.variant_option_types !== undefined) updateData.variant_option_types = body.variant_option_types;

  const { data: updatedProduct, error: updateError } = await supabase
    .from("products")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (updateError || !updatedProduct) {
    throw updateError || new Error("Failed to update product");
  }

  if (
    body.quantity !== undefined &&
    !(existingProduct as { has_variants?: boolean }).has_variants
  ) {
    const newQuantity = parseInt(String(body.quantity), 10);
    try {
      await logStockChangeFromAbsoluteQuantity(supabase, {
        providerId,
        productId: id,
        previousQuantity,
        newQuantity,
        actorUserId: user.id,
      });
    } catch (logErr) {
      console.error("[products PATCH] stock movement log failed:", logErr);
    }
  }

  // Replace variants if sent
  const variantsPayload = body.variants;
  if (Array.isArray(variantsPayload)) {
    const { error: delErr } = await supabase.from("product_variants").delete().eq("product_id", id);
    if (delErr) throw delErr;
    if (variantsPayload.length > 0) {
      const providerId = await getProviderIdForUser(user.id, supabase);
      const providerShort = providerId ? providerId.substring(0, 4).toUpperCase() : "PRVD";
      const baseTs = Date.now().toString().slice(-6);
      const variantRows = variantsPayload.map((v: any, idx: number) => ({
        product_id: id,
        option_values: v.option_values || {},
        sort_order: v.sort_order ?? idx,
        sku: v.sku || `PROD-${providerShort}-${baseTs}-V${idx + 1}`,
        barcode: v.barcode || null,
        measure: v.measure || null,
        amount: v.amount ?? null,
        quantity: v.quantity ?? 0,
        low_stock_level: v.low_stock_level ?? 5,
        reorder_quantity: v.reorder_quantity ?? 0,
        supply_price: parseFloat(String(v.supply_price ?? 0)),
        retail_price: parseFloat(String(v.retail_price ?? 0)),
        markup: v.markup ?? null,
        image_url: v.image_url || null,
      }));
      const { error: insErr } = await supabase.from("product_variants").insert(variantRows);
      if (insErr) throw insErr;
    }
  }

  const { data: final } = await supabase
    .from("products")
    .select("*, product_variants(*)")
    .eq("id", id)
    .single();
  const variants = ((final as any)?.product_variants || []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const { product_variants: __, ...rest } = (final || updatedProduct) as any;
  return successResponse({ ...rest, variants });
}

/**
 * PATCH /api/provider/products/[id]
 * Update a product (partial update).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return await updateProductHandler(request, params);
  } catch (error) {
    return handleApiError(error, "Failed to update product");
  }
}

/**
 * PUT /api/provider/products/[id]
 * Update a product (same semantics as PATCH; for clients that send PUT).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return await updateProductHandler(request, params);
  } catch (error) {
    return handleApiError(error, "Failed to update product");
  }
}

/**
 * DELETE /api/provider/products/[id]
 * 
 * Delete a product
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission('edit_products', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const archive = new URL(request.url).searchParams.get("archive") === "true";

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: existingProduct } = await supabase
      .from("products")
      .select("id, name")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingProduct) {
      return notFoundResponse("Product not found");
    }

    if (archive) {
      const { error: archiveError } = await supabase
        .from("products")
        .update({ is_active: false })
        .eq("id", id);
      if (archiveError) throw archiveError;
      return successResponse({ success: true, archived: true });
    }

    const { count, data: bookingRefs } = await supabase
      .from("booking_products")
      .select("id, booking_id", { count: "exact", head: false })
      .eq("product_id", id)
      .limit(5);

    if ((count ?? 0) > 0) {
      return errorResponse(
        `This product is linked to ${count} booking(s) and cannot be deleted.`,
        "PRODUCT_HAS_BOOKINGS",
        409,
        {
          count,
          sample: (bookingRefs ?? []).map((r: { booking_id?: string }) => r.booking_id).filter(Boolean),
        },
      );
    }

    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete product");
  }
}
