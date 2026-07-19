import type { SupabaseClient } from "@supabase/supabase-js";
import { logBookingStockMovements } from "@/lib/products/stock-movements";
import type { ValidatedProviderBookingProduct } from "@/lib/bookings/validate-provider-booking-products";

export type ExistingBookingProductRow = {
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
  | { ok: true; stockWasDeducted: boolean }
  | { ok: false; message: string; code: "INSUFFICIENT_STOCK" | "STOCK_RECONCILE_FAILED" };

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
    return { ok: true, stockWasDeducted: false };
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

  for (const line of deductLines) {
    const product = params.newProducts.find(
      (p) =>
        p.productId === line.productId &&
        (p.productVariantId ?? null) === (line.productVariantId ?? null),
    );
    if (product?.trackStock) {
      const { error } = line.productVariantId
        ? await (supabase.rpc as (name: string, args: Record<string, unknown>) => ReturnType<SupabaseClient["rpc"]>)(
            "decrement_product_variant_stock",
            { p_variant_id: line.productVariantId, p_quantity: line.quantity },
          )
        : await supabase.rpc("decrement_product_stock", {
            p_product_id: line.productId,
            p_quantity: line.quantity,
          });
      if (error) {
        return {
          ok: false,
          message: error.message || "Insufficient stock for updated product quantities.",
          code: "INSUFFICIENT_STOCK",
        };
      }
    }
  }

  for (const line of restockLines) {
    const { error } = line.productVariantId
      ? await (supabase.rpc as (name: string, args: Record<string, unknown>) => ReturnType<SupabaseClient["rpc"]>)(
          "increment_product_variant_stock",
          { p_variant_id: line.productVariantId, p_quantity: line.quantity },
        )
      : await supabase.rpc("increment_product_stock", {
          p_product_id: line.productId,
          p_quantity: line.quantity,
        });
    if (error) {
      return {
        ok: false,
        message: error.message || "Could not restore stock for removed products.",
        code: "STOCK_RECONCILE_FAILED",
      };
    }
  }

  try {
    if (deductLines.length > 0) {
      await logBookingStockMovements(supabase, {
        providerId: params.providerId,
        bookingId: params.bookingId,
        actorUserId: params.actorUserId ?? null,
        lines: deductLines,
        revert: false,
      });
    }
    if (restockLines.length > 0) {
      await logBookingStockMovements(supabase, {
        providerId: params.providerId,
        bookingId: params.bookingId,
        actorUserId: params.actorUserId ?? null,
        lines: restockLines,
        revert: true,
      });
    }
  } catch (logErr) {
    console.error("[reconcileBookingProductStockOnEdit] stock movement log failed:", logErr);
  }

  return { ok: true, stockWasDeducted: true };
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
