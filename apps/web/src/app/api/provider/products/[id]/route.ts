import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError, requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

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

    const { data: product, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !product) {
      return notFoundResponse("Product not found");
    }

    return successResponse(product);
  } catch (error) {
    return handleApiError(error, "Failed to fetch product");
  }
}

/**
 * PATCH /api/provider/products/[id]
 * 
 * Update a product
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to edit products
    const permissionCheck = await requirePermission('edit_products', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify product belongs to provider
    const { data: existingProduct } = await supabase
      .from("products")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingProduct) {
      return notFoundResponse("Product not found");
    }

    // Build update data
    const updateData: any = {};
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
    if (body.quantity !== undefined) updateData.quantity = parseInt(body.quantity);
    if (body.low_stock_level !== undefined) updateData.low_stock_level = parseInt(body.low_stock_level);
    if (body.reorder_quantity !== undefined) updateData.reorder_quantity = parseInt(body.reorder_quantity);
    if (body.supply_price !== undefined) updateData.supply_price = parseFloat(body.supply_price);
    if (body.retail_price !== undefined) updateData.retail_price = parseFloat(body.retail_price);
    if (body.retail_sales_enabled !== undefined) updateData.retail_sales_enabled = body.retail_sales_enabled;
    if (body.markup !== undefined) updateData.markup = body.markup;
    if (body.tax_rate !== undefined) updateData.tax_rate = parseFloat(body.tax_rate);
    if (body.team_member_commission_enabled !== undefined) updateData.team_member_commission_enabled = body.team_member_commission_enabled;
    if (body.track_stock_quantity !== undefined) updateData.track_stock_quantity = body.track_stock_quantity;
    if (body.receive_low_stock_notifications !== undefined) updateData.receive_low_stock_notifications = body.receive_low_stock_notifications;
    if (body.image_urls !== undefined) updateData.image_urls = body.image_urls;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    const { data: updatedProduct, error: updateError } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedProduct) {
      throw updateError || new Error("Failed to update product");
    }

    return successResponse(updatedProduct);
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
    // Check permission to edit products (deletion requires edit permission)
    const permissionCheck = await requirePermission('edit_products', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify product belongs to provider
    const { data: existingProduct } = await supabase
      .from("products")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingProduct) {
      return notFoundResponse("Product not found");
    }

    // Delete product
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
