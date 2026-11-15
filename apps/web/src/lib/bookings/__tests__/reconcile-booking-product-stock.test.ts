import { describe, expect, it, vi } from "vitest";
import { reconcileBookingProductStockOnEdit } from "../reconcile-booking-product-stock";
import type { ValidatedProviderBookingProduct } from "../validate-provider-booking-products";

vi.mock("@/lib/products/stock-movements", () => ({
  logBookingStockMovements: vi.fn(async () => undefined),
}));

function product(productId: string, quantity: number): ValidatedProviderBookingProduct {
  return {
    productId,
    productVariantId: null,
    quantity,
    unitPrice: 10,
    totalPrice: 10 * quantity,
    currency: "ZAR",
    name: productId,
    trackStock: true,
  };
}

describe("reconcileBookingProductStockOnEdit", () => {
  it("puts an increase back when a later return fails", async () => {
    const calls: string[] = [];
    const supabase = {
      rpc: vi.fn(async (name: string, args: { p_product_id: string }) => {
        calls.push(`${name}:${args.p_product_id}`);
        if (name === "increment_product_stock" && args.p_product_id === "oil") {
          return { error: { message: "could not return oil" } };
        }
        return { error: null };
      }),
    };

    const result = await reconcileBookingProductStockOnEdit(supabase as never, {
      providerId: "provider-1",
      bookingId: "booking-1",
      existingRows: [
        { id: "a", product_id: "shampoo", quantity: 1, stock_deducted_at: "t" },
        { id: "b", product_id: "oil", quantity: 1, stock_deducted_at: "t" },
      ],
      newProducts: [product("shampoo", 2)],
    });

    expect(result).toMatchObject({ ok: false, code: "STOCK_RECONCILE_FAILED" });
    expect(calls).toEqual([
      "decrement_product_stock:shampoo",
      "increment_product_stock:oil",
      "increment_product_stock:shampoo",
    ]);
  });

  it("does not move stock when nothing was taken yet", async () => {
    const rpc = vi.fn();
    const result = await reconcileBookingProductStockOnEdit({ rpc } as never, {
      providerId: "provider-1",
      bookingId: "booking-1",
      existingRows: [{ id: "a", product_id: "shampoo", quantity: 1, stock_deducted_at: null }],
      newProducts: [product("shampoo", 2)],
    });

    expect(result).toEqual({
      ok: true,
      stockWasDeducted: false,
      deductLines: [],
      restockLines: [],
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("puts the extra unit back on the product row when the undo call fails", async () => {
    const updates: Array<{ id: string; quantity: number }> = [];
    const supabase = {
      rpc: vi.fn(async (name: string, args: { p_product_id: string }) => {
        if (name === "decrement_product_stock") return { error: null };
        return { error: { message: `${name} down` } };
      }),
      from(table: string) {
        if (table !== "products") throw new Error(table);
        return {
          select: () => ({
            eq: (_column: string, id: string) => ({
              single: async () =>
                id === "oil"
                  ? { data: null, error: { message: "missing" } }
                  : { data: { quantity: 3 }, error: null },
            }),
          }),
          update: (payload: { quantity: number }) => ({
            eq: (_column: string, id: string) => ({
              eq: () => ({
                select: async () => {
                  updates.push({ id, quantity: payload.quantity });
                  return { data: [{ id }], error: null };
                },
              }),
            }),
          }),
        };
      },
    };

    const result = await reconcileBookingProductStockOnEdit(supabase as never, {
      providerId: "provider-1",
      bookingId: "booking-1",
      existingRows: [
        { id: "a", product_id: "shampoo", quantity: 1, stock_deducted_at: "t" },
        { id: "b", product_id: "oil", quantity: 1, stock_deducted_at: "t" },
      ],
      newProducts: [product("shampoo", 2)],
    });

    expect(result).toMatchObject({ ok: false, code: "STOCK_RECONCILE_FAILED" });
    expect(updates).toEqual([{ id: "shampoo", quantity: 4 }]);
  });
});
