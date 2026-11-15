import type { SupabaseClient } from "@supabase/supabase-js";
import { decrementStockQuantity, incrementStockQuantity } from "@/lib/orders/product-order-lifecycle";

export type BookingRetailStockLine = {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
};

type BookingProductStockRow = {
  id: string;
  product_id: string | null;
  product_variant_id?: string | null;
  quantity: number | null;
  products?: { track_stock_quantity?: boolean | null } | null;
};

/**
 * Take retail stock for products on a booking that have not been taken yet.
 * The taken mark is claimed before the quantity moves. A later attempt skips a
 * row another caller already claimed, and the mark is released if the quantity
 * does not leave stock.
 */
export async function deductBookingRetailStock(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingRetailStockLine[]> {
  const { data, error } = await supabase
    .from("booking_products")
    .select(
      "id, product_id, product_variant_id, quantity, products:products!booking_products_product_id_fkey(track_stock_quantity)",
    )
    .eq("booking_id", bookingId)
    .is("stock_deducted_at", null);
  if (error) throw new Error(error.message || "Could not load booking products");

  const rows = (data ?? []) as BookingProductStockRow[];
  if (rows.length === 0) return [];

  const changed: BookingRetailStockLine[] = [];
  const deductTs = new Date().toISOString();
  for (const row of rows) {
    const quantity = Number(row.quantity ?? 0);
    if (!row.product_id || !(quantity > 0)) continue;
    if (row.products?.track_stock_quantity === false) continue;

    const { data: claimed, error: claimErr } = await supabase
      .from("booking_products")
      .update({ stock_deducted_at: deductTs })
      .eq("id", row.id)
      .is("stock_deducted_at", null)
      .select("id");
    if (claimErr) throw new Error(claimErr.message || "Could not record the stock deduction");
    if (!claimed?.length) continue;

    const taken = await decrementStockQuantity(supabase, {
      variantId: row.product_variant_id ?? null,
      productId: row.product_id,
    }, quantity);
    if (!taken) {
      await supabase
        .from("booking_products")
        .update({ stock_deducted_at: null })
        .eq("id", row.id)
        .eq("stock_deducted_at", deductTs);
      throw new Error("Product stock could not be deducted");
    }
    changed.push({
      id: row.id,
      productId: row.product_id,
      variantId: row.product_variant_id ?? null,
      quantity,
    });
  }
  return changed;
}

/**
 * Put retail stock back for products that were taken when the visit was
 * completed. The taken mark is cleared before the quantity moves, so a second
 * cancel does not add the same units. The mark is put back if the quantity
 * does not return.
 */
export async function restoreBookingRetailStock(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingRetailStockLine[]> {
  const { data, error } = await supabase
    .from("booking_products")
    .select("id, product_id, product_variant_id, quantity")
    .eq("booking_id", bookingId)
    .not("stock_deducted_at", "is", null);
  if (error) throw new Error(error.message || "Could not load booking products");

  const rows = (data ?? []) as Array<{
    id: string;
    product_id: string | null;
    product_variant_id?: string | null;
    quantity: number | null;
  }>;
  if (rows.length === 0) return [];

  const changed: BookingRetailStockLine[] = [];
  for (const row of rows) {
    const quantity = Number(row.quantity ?? 0);
    if (!row.product_id || !(quantity > 0)) continue;

    const { data: claimed, error: claimErr } = await supabase
      .from("booking_products")
      .update({ stock_deducted_at: null })
      .eq("id", row.id)
      .not("stock_deducted_at", "is", null)
      .select("id");
    if (claimErr) throw new Error(claimErr.message || "Could not record the stock return");
    if (!claimed?.length) continue;

    const restored = await incrementStockQuantity(supabase, {
      variantId: row.product_variant_id ?? null,
      productId: row.product_id,
    }, quantity);
    if (!restored) {
      await supabase
        .from("booking_products")
        .update({ stock_deducted_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("stock_deducted_at", null);
      throw new Error("Product stock could not be restored");
    }
    changed.push({
      id: row.id,
      productId: row.product_id,
      variantId: row.product_variant_id ?? null,
      quantity,
    });
  }
  return changed;
}

/**
 * The visit status was not saved after these lines moved. Put each line back
 * only while this request still holds it, so a later save is left as it is.
 */
export async function undoUnsavedBookingStock(
  supabase: SupabaseClient,
  taken: BookingRetailStockLine[],
  returned: BookingRetailStockLine[],
): Promise<void> {
  for (const line of taken) {
    const { data: claimed, error: claimErr } = await supabase
      .from("booking_products")
      .update({ stock_deducted_at: null })
      .eq("id", line.id)
      .not("stock_deducted_at", "is", null)
      .select("id");
    if (claimErr) throw new Error(claimErr.message || "Could not record the stock return");
    if (!claimed?.length) continue;
    const restored = await incrementStockQuantity(supabase, {
      variantId: line.variantId,
      productId: line.productId,
    }, line.quantity);
    if (!restored) {
      await supabase
        .from("booking_products")
        .update({ stock_deducted_at: new Date().toISOString() })
        .eq("id", line.id)
        .is("stock_deducted_at", null);
      throw new Error("Product stock could not be restored");
    }
  }

  for (const line of returned) {
    const stamp = new Date().toISOString();
    const { data: claimed, error: claimErr } = await supabase
      .from("booking_products")
      .update({ stock_deducted_at: stamp })
      .eq("id", line.id)
      .is("stock_deducted_at", null)
      .select("id");
    if (claimErr) throw new Error(claimErr.message || "Could not record the stock deduction");
    if (!claimed?.length) continue;
    const takenAgain = await decrementStockQuantity(supabase, {
      variantId: line.variantId,
      productId: line.productId,
    }, line.quantity);
    if (!takenAgain) {
      await supabase
        .from("booking_products")
        .update({ stock_deducted_at: null })
        .eq("id", line.id)
        .eq("stock_deducted_at", stamp);
      throw new Error("Product stock could not be deducted");
    }
  }
}

/**
 * A later save may already match the stock move. Put units back only when the
 * visit that was kept does not.
 */
export async function lineUpBookingStockWithSavedStatus(
  supabase: SupabaseClient,
  bookingId: string,
  taken: BookingRetailStockLine[],
  returned: BookingRetailStockLine[],
): Promise<void> {
  if (taken.length === 0 && returned.length === 0) return;
  let undoTaken = taken;
  let undoReturned = returned;
  const { data, error } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!error) {
    const status = String((data as { status?: string | null } | null)?.status ?? "");
    if (status === "completed") undoTaken = [];
    if (status === "cancelled" || status === "no_show") undoReturned = [];
  }
  await undoUnsavedBookingStock(supabase, undoTaken, undoReturned);
}
