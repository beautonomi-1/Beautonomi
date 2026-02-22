import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
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
    const supabase = await getSupabaseServer();

    // Get the cart item + product stock
    const { data: cartItem, error: cartErr } = await (supabase.from("cart_items") as any)
      .select("id, product_id, user_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (cartErr || !cartItem) {
      return errorResponse("Cart item not found", "NOT_FOUND", 404);
    }

    const { data: product } = await (supabase.from("products") as any)
      .select("quantity")
      .eq("id", cartItem.product_id)
      .single();

    if (product && parsed.quantity > product.quantity) {
      return errorResponse(
        `Only ${product.quantity} items available`,
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
    const supabase = await getSupabaseServer();

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
