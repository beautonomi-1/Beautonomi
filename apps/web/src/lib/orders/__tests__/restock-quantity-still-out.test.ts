import { describe, expect, it } from "vitest";
import { productOrderHasStockStillOut, productOrderRestockQuantity, restockQuantityStillOut } from "../product-order-lifecycle";

describe("restockQuantityStillOut", () => {
  it("puts the whole line back when the sale was not logged", () => {
    expect(
      restockQuantityStillOut({
        lineQuantity: 2,
        productId: "shampoo",
        variantId: null,
        movements: [],
      }),
    ).toBe(2);
  });

  it("puts back only the units still out", () => {
    expect(
      restockQuantityStillOut({
        lineQuantity: 2,
        productId: "shampoo",
        variantId: null,
        movements: [
          { product_id: "shampoo", product_variant_id: null, quantity_delta: -2 },
          { product_id: "shampoo", product_variant_id: null, quantity_delta: 1 },
        ],
      }),
    ).toBe(1);
  });

  it("does not put a line back twice", () => {
    expect(
      restockQuantityStillOut({
        lineQuantity: 2,
        productId: "shampoo",
        variantId: null,
        movements: [
          { product_id: "shampoo", product_variant_id: null, quantity_delta: -2 },
          { product_id: "shampoo", product_variant_id: null, quantity_delta: 2 },
        ],
      }),
    ).toBe(0);
  });
});

describe("productOrderRestockQuantity", () => {
  it("does not add stock for a walk-in that was never delivered", () => {
    expect(
      productOrderRestockQuantity({
        orderSource: "walk_in",
        deliveredAt: null,
        lineQuantity: 2,
        productId: "shampoo",
        variantId: null,
        movements: [],
      }),
    ).toBe(0);
  });

  it("puts a delivered walk-in line back when the sale was not logged", () => {
    expect(
      productOrderRestockQuantity({
        orderSource: "walk_in",
        deliveredAt: "2026-01-01T00:00:00.000Z",
        lineQuantity: 2,
        productId: "shampoo",
        variantId: null,
        movements: [],
      }),
    ).toBe(2);
  });

  it("puts an online line back when the sale was not logged", () => {
    expect(
      productOrderRestockQuantity({
        orderSource: "online",
        deliveredAt: null,
        lineQuantity: 2,
        productId: "shampoo",
        variantId: null,
        movements: [],
      }),
    ).toBe(2);
  });
});

describe("productOrderHasStockStillOut", () => {
  function supabaseFor(input: {
    order: { order_source: string; delivered_at: string | null };
    items: Array<{ product_id: string; product_variant_id: string | null; quantity: number }>;
    movements: Array<{ product_id: string; product_variant_id: string | null; quantity_delta: number }>;
  }) {
    return {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.maybeSingle = async () => ({ data: table === "product_orders" ? input.order : null, error: null });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({
            data: table === "product_order_items" ? input.items : table === "stock_movements" ? input.movements : [],
            error: null,
          });
        return chain;
      },
    };
  }

  it("is true when a delivered sale has no stock return logged", async () => {
    const stillOut = await productOrderHasStockStillOut(
      supabaseFor({
        order: { order_source: "online", delivered_at: "2026-01-01T00:00:00.000Z" },
        items: [{ product_id: "shampoo", product_variant_id: null, quantity: 1 }],
        movements: [],
      }) as never,
      "order-1",
    );
    expect(stillOut).toBe(true);
  });

  it("is false when a walk-in was never delivered", async () => {
    const stillOut = await productOrderHasStockStillOut(
      supabaseFor({
        order: { order_source: "walk_in", delivered_at: null },
        items: [{ product_id: "shampoo", product_variant_id: null, quantity: 1 }],
        movements: [],
      }) as never,
      "order-1",
    );
    expect(stillOut).toBe(false);
  });

  it("is false when the units were already put back", async () => {
    const stillOut = await productOrderHasStockStillOut(
      supabaseFor({
        order: { order_source: "online", delivered_at: "2026-01-01T00:00:00.000Z" },
        items: [{ product_id: "shampoo", product_variant_id: null, quantity: 1 }],
        movements: [{ product_id: "shampoo", product_variant_id: null, quantity_delta: -1 }, { product_id: "shampoo", product_variant_id: null, quantity_delta: 1 }],
      }) as never,
      "order-1",
    );
    expect(stillOut).toBe(false);
  });
});
