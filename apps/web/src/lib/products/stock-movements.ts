import type { SupabaseClient } from "@supabase/supabase-js";

export type StockMovementType =
  | "manual_in"
  | "manual_out"
  | "stock_count"
  | "damaged"
  | "returned"
  | "received"
  | "sale"
  | "sale_refund"
  | "booking"
  | "booking_revert"
  | "initial";

export interface RecordStockMovementInput {
  providerId: string;
  productId: string;
  productVariantId?: string | null;
  movementType: StockMovementType;
  quantityDelta: number;
  quantityAfter: number;
  reason?: string | null;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  actorUserId?: string | null;
}

export async function recordStockMovement(
  supabase: SupabaseClient,
  input: RecordStockMovementInput,
): Promise<void> {
  const { error } = await supabase.from("stock_movements").insert({
    provider_id: input.providerId,
    product_id: input.productId,
    product_variant_id: input.productVariantId ?? null,
    movement_type: input.movementType,
    quantity_delta: input.quantityDelta,
    quantity_after: input.quantityAfter,
    reason: input.reason ?? null,
    note: input.note ?? null,
    reference_type: input.referenceType ?? null,
    reference_id: input.referenceId ?? null,
    actor_user_id: input.actorUserId ?? null,
  });
  if (error) throw error;
}

export interface AdjustStockInput {
  providerId: string;
  productId: string;
  productVariantId?: string | null;
  delta: number;
  movementType: StockMovementType;
  reason?: string | null;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  actorUserId?: string | null;
}

export async function adjustProductStock(
  supabase: SupabaseClient,
  input: AdjustStockInput,
): Promise<{ newQuantity: number; movementId: string }> {
  const variantId = input.productVariantId ?? null;

  if (variantId) {
    const { data: variant, error: vErr } = await supabase
      .from("product_variants")
      .select("id, product_id, quantity, products!inner(provider_id)")
      .eq("id", variantId)
      .eq("product_id", input.productId)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!variant) throw new Error("Variant not found");
    const providerId = (variant as { products?: { provider_id?: string } }).products?.provider_id;
    if (providerId !== input.providerId) throw new Error("Variant not found");

    const current = Number((variant as { quantity?: number }).quantity) || 0;
    const newQuantity = current + input.delta;
    if (newQuantity < 0) throw new Error("Insufficient stock for this adjustment");

    const { error: uErr } = await supabase
      .from("product_variants")
      .update({ quantity: newQuantity })
      .eq("id", variantId);
    if (uErr) throw uErr;

    const { data: movement, error: mErr } = await supabase
      .from("stock_movements")
      .insert({
        provider_id: input.providerId,
        product_id: input.productId,
        product_variant_id: variantId,
        movement_type: input.movementType,
        quantity_delta: input.delta,
        quantity_after: newQuantity,
        reason: input.reason ?? null,
        note: input.note ?? null,
        reference_type: input.referenceType ?? null,
        reference_id: input.referenceId ?? null,
        actor_user_id: input.actorUserId ?? null,
      })
      .select("id")
      .single();
    if (mErr) throw mErr;
    return { newQuantity, movementId: movement.id };
  }

  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id, quantity, provider_id, has_variants")
    .eq("id", input.productId)
    .eq("provider_id", input.providerId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!product) throw new Error("Product not found");
  if ((product as { has_variants?: boolean }).has_variants) {
    throw new Error("This product has variants — select a variant for stock adjustments");
  }

  const current = Number((product as { quantity?: number }).quantity) || 0;
  const newQuantity = current + input.delta;
  if (newQuantity < 0) throw new Error("Insufficient stock for this adjustment");

  const { error: uErr } = await supabase
    .from("products")
    .update({ quantity: newQuantity })
    .eq("id", input.productId);
  if (uErr) throw uErr;

  const { data: movement, error: mErr } = await supabase
    .from("stock_movements")
    .insert({
      provider_id: input.providerId,
      product_id: input.productId,
      product_variant_id: null,
      movement_type: input.movementType,
      quantity_delta: input.delta,
      quantity_after: newQuantity,
      reason: input.reason ?? null,
      note: input.note ?? null,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      actor_user_id: input.actorUserId ?? null,
    })
    .select("id")
    .single();
  if (mErr) throw mErr;
  return { newQuantity, movementId: movement.id };
}

export function mapReasonToMovementType(reason: string, delta: number): StockMovementType {
  switch (reason) {
    case "stock_count":
      return "stock_count";
    case "received":
      return "received";
    case "returned":
      return "returned";
    case "damaged":
      return "damaged";
    case "manual_in":
      return "manual_in";
    case "manual_out":
      return "manual_out";
    default:
      return delta >= 0 ? "manual_in" : "manual_out";
  }
}

export async function logStockChangeFromAbsoluteQuantity(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    productId: string;
    productVariantId?: string | null;
    previousQuantity: number;
    newQuantity: number;
    actorUserId?: string | null;
  },
): Promise<void> {
  const delta = params.newQuantity - params.previousQuantity;
  if (delta === 0) return;
  await recordStockMovement(supabase, {
    providerId: params.providerId,
    productId: params.productId,
    productVariantId: params.productVariantId ?? null,
    movementType: delta > 0 ? "manual_in" : "manual_out",
    quantityDelta: delta,
    quantityAfter: params.newQuantity,
    reason: "Quantity updated",
    actorUserId: params.actorUserId ?? null,
  });
}

export async function logSaleStockMovements(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    referenceId: string;
    actorUserId?: string | null;
    lines: Array<{
      productId: string;
      productVariantId?: string | null;
      quantity: number;
    }>;
  },
): Promise<void> {
  for (const line of params.lines) {
    if (!line.productId || line.quantity <= 0) continue;
    const variantId = line.productVariantId ?? null;
    let qtyAfter = 0;
    if (variantId) {
      const { data: v } = await supabase
        .from("product_variants")
        .select("quantity")
        .eq("id", variantId)
        .maybeSingle();
      qtyAfter = Number((v as { quantity?: number } | null)?.quantity) || 0;
    } else {
      const { data: p } = await supabase
        .from("products")
        .select("quantity")
        .eq("id", line.productId)
        .maybeSingle();
      qtyAfter = Number((p as { quantity?: number } | null)?.quantity) || 0;
    }
    await recordStockMovement(supabase, {
      providerId: params.providerId,
      productId: line.productId,
      productVariantId: variantId,
      movementType: "sale",
      quantityDelta: -line.quantity,
      quantityAfter: qtyAfter,
      referenceType: "product_order",
      referenceId: params.referenceId,
      actorUserId: params.actorUserId ?? null,
    });
  }
}

export async function logBookingStockMovements(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    bookingId: string;
    actorUserId?: string | null;
    lines: Array<{
      productId: string;
      productVariantId?: string | null;
      quantity: number;
    }>;
    revert?: boolean;
  },
): Promise<void> {
  const movementType = params.revert ? "booking_revert" : "booking";
  for (const line of params.lines) {
    if (!line.productId || line.quantity <= 0) continue;
    const variantId = line.productVariantId ?? null;
    const signedQty = params.revert ? line.quantity : -line.quantity;
    let qtyAfter = 0;
    if (variantId) {
      const { data: v } = await supabase
        .from("product_variants")
        .select("quantity")
        .eq("id", variantId)
        .maybeSingle();
      qtyAfter = Number((v as { quantity?: number } | null)?.quantity) || 0;
    } else {
      const { data: p } = await supabase
        .from("products")
        .select("quantity")
        .eq("id", line.productId)
        .maybeSingle();
      qtyAfter = Number((p as { quantity?: number } | null)?.quantity) || 0;
    }
    await recordStockMovement(supabase, {
      providerId: params.providerId,
      productId: line.productId,
      productVariantId: variantId,
      movementType,
      quantityDelta: signedQty,
      quantityAfter: qtyAfter,
      referenceType: "booking",
      referenceId: params.bookingId,
      actorUserId: params.actorUserId ?? null,
    });
  }
}
