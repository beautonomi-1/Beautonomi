import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const addSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(100).default(1),
});

/**
 * GET /api/me/cart
 * List cart items with product details + stock validation
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer();

    const { data: items, error } = await (supabase.from("cart_items") as any)
      .select(
        `
        id,
        quantity,
        created_at,
        updated_at,
        product:products (
          id, name, retail_price, image_urls, quantity, is_active, retail_sales_enabled,
          brand, category, provider_id
        ),
        provider:providers (
          id, business_name, slug
        )
      `,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const enriched = (items ?? []).map((item: any) => ({
      ...item,
      in_stock:
        item.product?.is_active &&
        item.product?.retail_sales_enabled &&
        item.product?.quantity >= item.quantity,
      stock_available: item.product?.quantity ?? 0,
    }));

    return successResponse({ items: enriched });
  } catch (err) {
    return handleApiError(err, "Failed to fetch cart");
  }
}

/**
 * POST /api/me/cart
 * Add product to cart (upserts: increments quantity if already in cart)
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const body = await request.json();
    const parsed = addSchema.parse(body);
    const supabase = await getSupabaseServer();

    // Validate the product exists and is available
    const { data: product, error: prodErr } = await (supabase.from("products") as any)
      .select("id, provider_id, quantity, is_active, retail_sales_enabled, retail_price, name")
      .eq("id", parsed.product_id)
      .single();

    if (prodErr || !product) {
      return errorResponse("Product not found", "NOT_FOUND", 404);
    }
    if (!product.is_active || !product.retail_sales_enabled) {
      return errorResponse("Product is not available for purchase", "UNAVAILABLE", 400);
    }
    if (product.quantity < parsed.quantity) {
      return errorResponse(
        `Only ${product.quantity} items available`,
        "INSUFFICIENT_STOCK",
        400,
      );
    }

    // Upsert: if already in cart, increment quantity
    const { data: existing } = await (supabase.from("cart_items") as any)
      .select("id, quantity")
      .eq("user_id", user.id)
      .eq("product_id", parsed.product_id)
      .maybeSingle();

    let result;
    if (existing) {
      const newQty = existing.quantity + parsed.quantity;
      if (newQty > product.quantity) {
        return errorResponse(
          `Only ${product.quantity} items available (you have ${existing.quantity} in cart)`,
          "INSUFFICIENT_STOCK",
          400,
        );
      }
      const { data, error } = await (supabase.from("cart_items") as any)
        .update({ quantity: newQty })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await (supabase.from("cart_items") as any)
        .insert({
          user_id: user.id,
          product_id: parsed.product_id,
          provider_id: product.provider_id,
          quantity: parsed.quantity,
        })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return successResponse({ item: result }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to add to cart");
  }
}

/**
 * DELETE /api/me/cart
 * Clear entire cart
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer();

    const { error } = await (supabase.from("cart_items") as any)
      .delete()
      .eq("user_id", user.id);

    if (error) throw error;

    return successResponse({ cleared: true });
  } catch (err) {
    return handleApiError(err, "Failed to clear cart");
  }
}
