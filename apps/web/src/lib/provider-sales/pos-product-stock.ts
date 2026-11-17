/**
 * POS product line stock checks and RPC decrements (shared by POST / PATCH sales).
 */
import { restockQuantityStillOut } from "@/lib/orders/product-order-lifecycle";
import { isBookingCollectionSale } from "@/lib/reports/provider-sales-history";

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
      .select("id, name, quantity, has_variants, provider_id, is_active, track_stock_quantity")
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
      if ((prod as { track_stock_quantity?: boolean }).track_stock_quantity !== false && Number(pv.quantity) < qty) {
        return `${prod.name}: only ${pv.quantity} in stock for that option (requested ${qty}).`;
      }
    } else if (Boolean((prod as { has_variants?: boolean }).has_variants)) {
      return `${prod.name} has variants — select a specific option so inventory matches ecommerce / bookings.`;
    } else if ((prod as { track_stock_quantity?: boolean }).track_stock_quantity === false) {
      // Unlimited / made-to-order — no base-quantity gate
    } else if (Number(prod.quantity) < qty) {
      return `${prod.name}: only ${prod.quantity} in stock (requested ${qty}).`;
    }
  }
  return null;
}

/**
 * Same decrements as `applyPosProductStockDecrements`, but a failure puts back
 * every unit this call already took. Callers that abort the sale can then void
 * a still-reserved gift card without leaving stock or the card short.
 */
export type PosStockLineTaken = {
  productId: string;
  variantId: string | null;
  quantity: number;
};

async function putPosLineBack(supabase: any, line: PosStockLineTaken): Promise<boolean> {
  try {
    const result = line.variantId
      ? await supabase.rpc("increment_product_variant_stock", {
          p_variant_id: line.variantId,
          p_quantity: line.quantity,
        })
      : await supabase.rpc("increment_product_stock", {
          p_product_id: line.productId,
          p_quantity: line.quantity,
        });
    return !(result && typeof result === "object" && result.error);
  } catch (err) {
    console.error("[putPosLineBack] stock increment failed:", err);
    return false;
  }
}

async function takePosLineOff(supabase: any, line: PosStockLineTaken): Promise<boolean> {
  try {
    const result = line.variantId
      ? await supabase.rpc("decrement_product_variant_stock", {
          p_variant_id: line.variantId,
          p_quantity: line.quantity,
        })
      : await supabase.rpc("decrement_product_stock", {
          p_product_id: line.productId,
          p_quantity: line.quantity,
        });
    return !(result && typeof result === "object" && result.error);
  } catch (err) {
    console.error("[takePosLineOff] stock decrement failed:", err);
    return false;
  }
}

/** Puts each line back. Lines whose quantity did not increase are left out of the result. */
export async function restorePosProductStock(
  supabase: any,
  lines: PosStockLineTaken[],
): Promise<PosStockLineTaken[]> {
  const restored: PosStockLineTaken[] = [];
  for (const line of lines) {
    if (await putPosLineBack(supabase, line)) restored.push(line);
  }
  return restored;
}

export async function applyPosProductStockDecrementsReversible(
  supabase: any,
  items: Array<{
    type?: string;
    item_id?: string | null;
    product_variant_id?: string | null;
    quantity?: number;
  }>,
): Promise<PosStockLineTaken[]> {
  const applied: Array<{ productId: string; variantId: string | null; quantity: number }> = [];
  try {
    for (const item of items) {
      const lineType = item.type || "product";
      if (lineType !== "product") continue;
      const productId = item.item_id;
      const variantId = item.product_variant_id ?? null;
      const qty = Math.max(1, Math.floor(Number(item.quantity || 1)));
      if (!productId) continue;

      const { data: prodRow, error: pe } = await supabase
        .from("products")
        .select("track_stock_quantity")
        .eq("id", productId)
        .maybeSingle();
      if (pe) throw new Error(pe.message || "product stock lookup failed");
      if ((prodRow as { track_stock_quantity?: boolean } | null)?.track_stock_quantity === false) {
        continue;
      }

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
      applied.push({ productId, variantId, quantity: qty });
    }
  } catch (error) {
    for (const line of applied.reverse()) {
      const restored = await putPosLineBack(supabase, line);
      if (!restored) {
        console.error("[applyPosProductStockDecrementsReversible] undo failed:", line);
      }
    }
    throw error;
  }
  return applied;
}

/** A till sale takes product stock. A booking-card sale does not; the booking does. */
export function posSaleTracksProductStock(notes: string | null | undefined): boolean {
  return !isBookingCollectionSale(notes);
}

/** A completed till sale took stock. A booking-card sale did not. A refunded sale already put it back. */
export function posSaleRefundShouldRestoreStock(sale: {
  payment_status?: string | null;
  notes?: string | null;
}): boolean {
  return (
    String(sale.payment_status ?? "").toLowerCase() === "completed" &&
    posSaleTracksProductStock(sale.notes)
  );
}

/** Take stock for a till sale that is becoming completed. */
export async function decrementPosSaleStock(supabase: any, saleId: string): Promise<void> {
  const { data, error } = await supabase
    .from("sale_items")
    .select("item_type, item_id, product_variant_id, quantity")
    .eq("sale_id", saleId);
  if (error) throw new Error(error.message || "sale line lookup failed");
  await applyPosProductStockDecrements(
    supabase,
    ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      type: String(row.item_type || "product"),
      item_id: row.item_id ? String(row.item_id) : null,
      product_variant_id: row.product_variant_id ? String(row.product_variant_id) : null,
      quantity: Number(row.quantity ?? 1),
    })),
  );
}

/**
 * Put a completed till sale's products back once. A later refund sees the
 * sale_refund movement and does not add the same units again.
 */
export async function restorePosSaleStock(
  supabase: any,
  input: { saleId: string; providerId: string },
): Promise<void> {
  const { data: items, error } = await supabase
    .from("sale_items")
    .select("item_type, item_id, product_variant_id, quantity")
    .eq("sale_id", input.saleId);
  if (error) throw new Error(error.message || "sale line lookup failed");

  const { data: movementRows } = await supabase
    .from("stock_movements")
    .select("product_id, product_variant_id, quantity_delta")
    .eq("reference_type", "sale")
    .eq("reference_id", input.saleId);
  const movements = Array.isArray(movementRows) ? movementRows : [];

  const lines: PosStockLineTaken[] = [];
  for (const row of (items ?? []) as Array<Record<string, unknown>>) {
    const lineType = String(row.item_type || "product");
    if (lineType !== "product") continue;
    const productId = row.item_id ? String(row.item_id) : "";
    if (!productId) continue;
    const { data: prodRow, error: pe } = await supabase
      .from("products")
      .select("track_stock_quantity")
      .eq("id", productId)
      .maybeSingle();
    if (pe) throw new Error(pe.message || "product stock lookup failed");
    if ((prodRow as { track_stock_quantity?: boolean } | null)?.track_stock_quantity === false) {
      continue;
    }
    const variantId = row.product_variant_id ? String(row.product_variant_id) : null;
    const requested = Math.max(1, Math.floor(Number(row.quantity || 1)));
    const qty = restockQuantityStillOut({
      lineQuantity: requested,
      productId,
      variantId,
      movements,
    });
    if (qty <= 0) continue;
    lines.push({ productId, variantId, quantity: qty });
  }
  if (lines.length === 0) return;

  const restored = await restorePosProductStock(supabase, lines);
  let recordFailed = restored.length !== lines.length;

  for (const line of restored) {
    let qtyAfter = 0;
    if (line.variantId) {
      const { data: variant } = await supabase
        .from("product_variants")
        .select("quantity")
        .eq("id", line.variantId)
        .maybeSingle();
      qtyAfter = Number((variant as { quantity?: number } | null)?.quantity) || 0;
    } else {
      const { data: product } = await supabase
        .from("products")
        .select("quantity")
        .eq("id", line.productId)
        .maybeSingle();
      qtyAfter = Number((product as { quantity?: number } | null)?.quantity) || 0;
    }
    const { error: insertError } = await supabase.from("stock_movements").insert({
      provider_id: input.providerId,
      product_id: line.productId,
      product_variant_id: line.variantId,
      movement_type: "sale_refund",
      quantity_delta: line.quantity,
      quantity_after: qtyAfter,
      reason: "Till sale refund",
      reference_type: "sale",
      reference_id: input.saleId,
    });
    if (insertError) {
      recordFailed = true;
      const undone = await takePosLineOff(supabase, line);
      if (!undone) {
        console.error("[restorePosSaleStock] restock record missing and quantity could not be taken back", line);
      }
    }
  }
  if (recordFailed) {
    throw new Error("Product stock could not be restored");
  }
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
  await applyPosProductStockDecrementsReversible(supabase, items);
}
