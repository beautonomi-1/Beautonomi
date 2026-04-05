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

const addSchema = z.object({
  product_id: z.string().uuid(),
  product_variant_id: z.string().uuid().optional().nullable(),
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
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);

    const { data: items, error } = await (supabase.from("cart_items") as any)
      .select(
        `
        id,
        quantity,
        product_variant_id,
        created_at,
        updated_at,
        product:products (
          id, name, retail_price, image_urls, quantity, is_active, retail_sales_enabled,
          brand, category, provider_id, has_variants
        ),
        product_variant:product_variants (
          id, retail_price, quantity, option_values
        ),
        provider:providers (
          id, business_name, slug
        )
      `,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const providerIds = Array.from(
      new Set(
        (items ?? [])
          .map((item: any) => item.product?.provider_id ?? item.provider?.id ?? null)
          .filter((id: string | null): id is string => Boolean(id)),
      ),
    );
    const { data: tenantProviders } = providerIds.length
      ? await supabase.from("providers").select("id").in("id", providerIds).eq("tenant_id", tenantId)
      : { data: [] as Array<{ id: string }> };
    const allowedProviderIds = new Set((tenantProviders ?? []).map((p) => p.id));

    const enriched = (items ?? [])
      .filter((item: any) => {
        const providerId = item.product?.provider_id ?? item.provider?.id ?? null;
        return providerId != null && allowedProviderIds.has(providerId);
      })
      .map((item: any) => {
      const effectiveQty = item.product_variant ? item.product_variant.quantity : item.product?.quantity ?? 0;
      const effectivePrice = item.product_variant ? item.product_variant.retail_price : item.product?.retail_price ?? 0;
      return {
        ...item,
        effective_price: effectivePrice,
        in_stock:
          item.product?.is_active &&
          item.product?.retail_sales_enabled &&
          effectiveQty >= item.quantity,
        stock_available: effectiveQty,
      };
    });

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
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);

    // Validate the product exists and is available
    const { data: product, error: prodErr } = await (supabase.from("products") as any)
      .select("id, provider_id, quantity, is_active, retail_sales_enabled, retail_price, name, has_variants")
      .eq("id", parsed.product_id)
      .single();

    if (prodErr || !product) {
      return errorResponse("Product not found", "NOT_FOUND", 404);
    }
    const { data: productProvider } = await supabase
      .from("providers")
      .select("id")
      .eq("id", product.provider_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!productProvider?.id) {
      return errorResponse("Product not available in this market", "TENANT_MISMATCH", 404);
    }
    if (!product.is_active || !product.retail_sales_enabled) {
      return errorResponse("Product is not available for purchase", "UNAVAILABLE", 400);
    }

    const variantId = parsed.product_variant_id || null;
    let effectiveQuantity = product.quantity;
    if (product.has_variants && variantId) {
      const { data: variant, error: varErr } = await (supabase.from("product_variants") as any)
        .select("id, product_id, quantity, retail_price")
        .eq("id", variantId)
        .eq("product_id", parsed.product_id)
        .single();
      if (varErr || !variant) {
        return errorResponse("Variant not found", "NOT_FOUND", 404);
      }
      effectiveQuantity = variant.quantity ?? 0;
    } else if (product.has_variants && !variantId) {
      return errorResponse("Please select a variant", "VARIANT_REQUIRED", 400);
    }

    if (effectiveQuantity < parsed.quantity) {
      return errorResponse(
        `Only ${effectiveQuantity} items available`,
        "INSUFFICIENT_STOCK",
        400,
      );
    }

    // Upsert: match by (user_id, product_id, product_variant_id)
    const existingQuery = (supabase.from("cart_items") as any)
      .select("id, quantity")
      .eq("user_id", user.id)
      .eq("product_id", parsed.product_id);
    if (variantId) {
      existingQuery.eq("product_variant_id", variantId);
    } else {
      existingQuery.is("product_variant_id", null);
    }
    const { data: existing } = await existingQuery.maybeSingle();

    let result;
    if (existing) {
      const newQty = existing.quantity + parsed.quantity;
      if (newQty > effectiveQuantity) {
        return errorResponse(
          `Only ${effectiveQuantity} items available (you have ${existing.quantity} in cart)`,
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
          product_variant_id: variantId,
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
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { data: tenantProviders } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId);
    const providerIds = (tenantProviders ?? []).map((p) => p.id);
    if (providerIds.length === 0) {
      return successResponse({ cleared: true });
    }

    const { error } = await (supabase.from("cart_items") as any)
      .delete()
      .eq("user_id", user.id)
      .in("provider_id", providerIds);

    if (error) throw error;

    return successResponse({ cleared: true });
  } catch (err) {
    return handleApiError(err, "Failed to clear cart");
  }
}
