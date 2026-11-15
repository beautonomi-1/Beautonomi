import type { SupabaseClient } from "@supabase/supabase-js";
import { decrementStockQuantity, incrementStockQuantity } from "@/lib/orders/product-order-lifecycle";
import { logBookingStockMovements } from "@/lib/products/stock-movements";
import type { ValidatedProviderBookingProduct } from "@/lib/bookings/validate-provider-booking-products";

export type ExistingBookingProductRow = {
  id?: string;
  product_id: string;
  product_variant_id?: string | null;
  quantity: number | null;
  stock_deducted_at?: string | null;
};

function productLineKey(productId: string, variantId?: string | null): string {
  return `${productId}:${variantId ?? ""}`;
}

function aggregateByKey(
  rows: Array<{ productId: string; productVariantId?: string | null; quantity: number }>,
): Map<string, { productId: string; productVariantId: string | null; quantity: number }> {
  const map = new Map<string, { productId: string; productVariantId: string | null; quantity: number }>();
  for (const row of rows) {
    const key = productLineKey(row.productId, row.productVariantId);
    const existing = map.get(key);
    if (existing) {
      existing.quantity += row.quantity;
    } else {
      map.set(key, {
        productId: row.productId,
        productVariantId: row.productVariantId ?? null,
        quantity: row.quantity,
      });
    }
  }
  return map;
}

export type ReconcileBookingProductStockResult =
  | {
      ok: true;
      stockWasDeducted: boolean;
      deductLines: StockReconcileLine[];
      restockLines: StockReconcileLine[];
    }
  | { ok: false; message: string; code: "INSUFFICIENT_STOCK" | "STOCK_RECONCILE_FAILED" };

type StockReconcileLine = {
  productId: string;
  productVariantId?: string | null;
  quantity: number;
};

async function applyBookingProductStockLine(
  supabase: SupabaseClient,
  line: StockReconcileLine,
  direction: "decrement" | "increment",
): Promise<string | null> {
  const target = {
    variantId: line.productVariantId ?? null,
    productId: line.productId,
  };
  const updated =
    direction === "decrement"
      ? await decrementStockQuantity(supabase, target, line.quantity)
      : await incrementStockQuantity(supabase, target, line.quantity);
  return updated ? null : "Product stock could not be updated.";
}

/** Put stock back when a product edit moved units and then could not save the lines. */
export async function reverseReconciledBookingProductStock(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    bookingId: string;
    actorUserId?: string | null;
    deductLines: StockReconcileLine[];
    restockLines: StockReconcileLine[];
    logMovements?: boolean;
  },
): Promise<void> {
  for (const line of [...params.deductLines].reverse()) {
    const message = await applyBookingProductStockLine(supabase, line, "increment");
    if (message) {
      console.error("[reverseReconciledBookingProductStock] undo deduct failed:", message);
    }
  }
  for (const line of [...params.restockLines].reverse()) {
    const message = await applyBookingProductStockLine(supabase, line, "decrement");
    if (message) {
      console.error("[reverseReconciledBookingProductStock] undo restock failed:", message);
    }
  }
  try {
    if (params.logMovements === false) return;
    if (params.deductLines.length > 0) {
      await logBookingStockMovements(supabase, {
        providerId: params.providerId,
        bookingId: params.bookingId,
        actorUserId: params.actorUserId ?? null,
        lines: params.deductLines,
        revert: true,
      });
    }
    if (params.restockLines.length > 0) {
      await logBookingStockMovements(supabase, {
        providerId: params.providerId,
        bookingId: params.bookingId,
        actorUserId: params.actorUserId ?? null,
        lines: params.restockLines,
        revert: false,
      });
    }
  } catch (logErr) {
    console.error("[reverseReconciledBookingProductStock] stock movement log failed:", logErr);
  }
}

/**
 * After booking product lines are replaced, reconcile inventory for rows that had
 * already been deducted (e.g. online bookings). Returns whether new rows should
 * carry stock_deducted_at.
 */
export async function reconcileBookingProductStockOnEdit(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    bookingId: string;
    actorUserId?: string | null;
    existingRows: ExistingBookingProductRow[];
    newProducts: ValidatedProviderBookingProduct[];
  },
): Promise<ReconcileBookingProductStockResult> {
  const oldAggregated = aggregateByKey(
    (params.existingRows ?? [])
      .filter((r) => r.product_id && (r.quantity ?? 0) > 0)
      .map((r) => ({
        productId: r.product_id,
        productVariantId: r.product_variant_id,
        quantity: Number(r.quantity ?? 0),
      })),
  );

  const oldDeductedAggregated = aggregateByKey(
    (params.existingRows ?? [])
      .filter((r) => r.product_id && (r.quantity ?? 0) > 0 && r.stock_deducted_at)
      .map((r) => ({
        productId: r.product_id,
        productVariantId: r.product_variant_id,
        quantity: Number(r.quantity ?? 0),
      })),
  );

  const newAggregated = aggregateByKey(
    params.newProducts.map((p) => ({
      productId: p.productId,
      productVariantId: p.productVariantId,
      quantity: p.quantity,
    })),
  );

  const hadAnyDeduction = oldDeductedAggregated.size > 0;
  if (!hadAnyDeduction) {
    return { ok: true, stockWasDeducted: false, deductLines: [], restockLines: [] };
  }

  const allKeys = new Set([...oldDeductedAggregated.keys(), ...newAggregated.keys()]);
  const restockLines: Array<{ productId: string; productVariantId?: string | null; quantity: number }> = [];
  const deductLines: Array<{ productId: string; productVariantId?: string | null; quantity: number }> = [];

  for (const key of allKeys) {
    const oldQty = oldDeductedAggregated.get(key)?.quantity ?? 0;
    const newQty = newAggregated.get(key)?.quantity ?? 0;
    const delta = newQty - oldQty;
    const productId = newAggregated.get(key)?.productId ?? oldDeductedAggregated.get(key)!.productId;
    const productVariantId =
      newAggregated.get(key)?.productVariantId ?? oldDeductedAggregated.get(key)!.productVariantId;

    if (delta < 0) {
      restockLines.push({ productId, productVariantId, quantity: Math.abs(delta) });
    } else if (delta > 0) {
      deductLines.push({ productId, productVariantId, quantity: delta });
    }
  }

  const appliedDeducts: StockReconcileLine[] = [];
  const appliedRestocks: StockReconcileLine[] = [];

  for (const line of deductLines) {
    const product = params.newProducts.find(
      (p) =>
        p.productId === line.productId &&
        (p.productVariantId ?? null) === (line.productVariantId ?? null),
    );
    if (!product?.trackStock) continue;
    const message = await applyBookingProductStockLine(supabase, line, "decrement");
    if (message) {
      await reverseReconciledBookingProductStock(supabase, {
        providerId: params.providerId,
        bookingId: params.bookingId,
        actorUserId: params.actorUserId,
        deductLines: appliedDeducts,
        restockLines: appliedRestocks,
        logMovements: false,
      });
      return {
        ok: false,
        message: message || "Insufficient stock for updated product quantities.",
        code: "INSUFFICIENT_STOCK",
      };
    }
    appliedDeducts.push(line);
  }

  for (const line of restockLines) {
    const message = await applyBookingProductStockLine(supabase, line, "increment");
    if (message) {
      await reverseReconciledBookingProductStock(supabase, {
        providerId: params.providerId,
        bookingId: params.bookingId,
        actorUserId: params.actorUserId,
        deductLines: appliedDeducts,
        restockLines: appliedRestocks,
        logMovements: false,
      });
      return {
        ok: false,
        message: message || "Could not restore stock for removed products.",
        code: "STOCK_RECONCILE_FAILED",
      };
    }
    appliedRestocks.push(line);
  }

  try {
    if (appliedDeducts.length > 0) {
      await logBookingStockMovements(supabase, {
        providerId: params.providerId,
        bookingId: params.bookingId,
        actorUserId: params.actorUserId ?? null,
        lines: appliedDeducts,
        revert: false,
      });
    }
    if (appliedRestocks.length > 0) {
      await logBookingStockMovements(supabase, {
        providerId: params.providerId,
        bookingId: params.bookingId,
        actorUserId: params.actorUserId ?? null,
        lines: appliedRestocks,
        revert: true,
      });
    }
  } catch (logErr) {
    console.error("[reconcileBookingProductStockOnEdit] stock movement log failed:", logErr);
  }

  return {
    ok: true,
    stockWasDeducted: true,
    deductLines: appliedDeducts,
    restockLines: appliedRestocks,
  };
}

/** Reserved quantities already on the booking (for stock validation credit). */
export function buildExistingReservedQuantities(
  existingRows: ExistingBookingProductRow[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of existingRows ?? []) {
    if (!row.product_id || !(row.quantity ?? 0)) continue;
    const key = productLineKey(row.product_id, row.product_variant_id);
    map.set(key, (map.get(key) ?? 0) + Number(row.quantity ?? 0));
  }
  return map;
}
