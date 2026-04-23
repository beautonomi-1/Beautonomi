/**
 * POS product line stock checks and RPC decrements (shared by POST / PATCH sales).
 */

/** `null` = OK; otherwise a user-facing validation error. */
export async function validatePosProductStock(
  supabase: any,
  providerId: string,
  items: Array<{
    type?: string;
    item_id?: string | null;
    product_variant_id?: string | null;
    quantity?: number;
  }>,
): Promise<string | null> {
  for (const item of items) {
    const lineType = item.type || "product";
    if (lineType !== "product") continue;
    const productId = item.item_id;
    const variantId = item.product_variant_id ?? null;
    const qty = Math.max(1, Math.floor(Number(item.quantity || 1)));
    if (!productId || typeof productId !== "string") continue;

    const { data: prod, error } = await supabase
      .from("products")
      .select("id, name, quantity, has_variants, provider_id, is_active")
      .eq("id", productId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (error) return error.message;
    if (!prod || !prod.is_active) {
      return `Product not found or inactive: ${productId}`;
    }

    if (variantId) {
      const { data: pv, error: ve } = await supabase
        .from("product_variants")
        .select("id, quantity, product_id")
        .eq("id", variantId)
        .eq("product_id", productId)
        .maybeSingle();
      if (ve) return ve.message;
      if (!pv) {
        return `Invalid variant for product "${prod.name}".`;
      }
      if (Number(pv.quantity) < qty) {
        return `${prod.name}: only ${pv.quantity} in stock for that option (requested ${qty}).`;
      }
    } else if (Boolean((prod as { has_variants?: boolean }).has_variants)) {
      return `${prod.name} has variants — select a specific option so inventory matches ecommerce / bookings.`;
    } else if (Number(prod.quantity) < qty) {
      return `${prod.name}: only ${prod.quantity} in stock (requested ${qty}).`;
    }
  }
  return null;
}

export async function applyPosProductStockDecrements(
  supabase: any,
  items: Array<{
    type?: string;
    item_id?: string | null;
    product_variant_id?: string | null;
    quantity?: number;
  }>,
): Promise<void> {
  for (const item of items) {
    const lineType = item.type || "product";
    if (lineType !== "product") continue;
    const productId = item.item_id;
    const variantId = item.product_variant_id ?? null;
    const qty = Math.max(1, Math.floor(Number(item.quantity || 1)));
    if (!productId) continue;

    if (variantId) {
      const { error } = await supabase.rpc("decrement_product_variant_stock", {
        p_variant_id: variantId,
        p_quantity: qty,
      });
      if (error) throw new Error(error.message || "decrement_product_variant_stock failed");
    } else {
      const { error } = await supabase.rpc("decrement_product_stock", {
        p_product_id: productId,
        p_quantity: qty,
      });
      if (error) throw new Error(error.message || "decrement_product_stock failed");
    }
  }
}
