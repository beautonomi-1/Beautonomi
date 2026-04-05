import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { z } from "zod";

const updateSchema = z.object({
  quantity: z.number().int().min(1).max(100),
});

/**
 * PATCH /api/me/cart/[id]
 * Update cart item quantity
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const body = await request.json();
    const parsed = updateSchema.parse(body);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);

    // Get the cart item + product/variant stock
    const { data: cartItem, error: cartErr } = await (supabase.from("cart_items") as any)
      .select("id, product_id, product_variant_id, user_id, provider_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (cartErr || !cartItem) {
      return errorResponse("Cart item not found", "NOT_FOUND", 404);
    }
    const { data: cartProvider } = await supabase
      .from("providers")
      .select("id")
      .eq("id", cartItem.provider_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!cartProvider?.id) {
      return errorResponse("Cart item not available in this market", "TENANT_MISMATCH", 404);
    }

    let maxQty = 999;
    if (cartItem.product_variant_id) {
      const { data: variant } = await (supabase.from("product_variants") as any)
        .select("quantity")
        .eq("id", cartItem.product_variant_id)
        .single();
      maxQty = variant?.quantity ?? 0;
    } else {
      const { data: product } = await (supabase.from("products") as any)
        .select("quantity")
        .eq("id", cartItem.product_id)
        .single();
      maxQty = product?.quantity ?? 0;
    }

    if (parsed.quantity > maxQty) {
      return errorResponse(
        `Only ${maxQty} items available`,
        "INSUFFICIENT_STOCK",
        400,
      );
    }

    const { data, error } = await (supabase.from("cart_items") as any)
      .update({ quantity: parsed.quantity })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) throw error;

    return successResponse({ item: data });
  } catch (err) {
    return handleApiError(err, "Failed to update cart item");
  }
}

/**
 * DELETE /api/me/cart/[id]
 * Remove a single cart item
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);

    const { data: item } = await (supabase.from("cart_items") as any)
      .select("id, provider_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!item) {
      return errorResponse("Cart item not found", "NOT_FOUND", 404);
    }
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("id", item.provider_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!provider?.id) {
      return errorResponse("Cart item not available in this market", "TENANT_MISMATCH", 404);
    }

    const { error } = await (supabase.from("cart_items") as any)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    return successResponse({ deleted: true });
  } catch (err) {
    return handleApiError(err, "Failed to remove cart item");
  }
}
