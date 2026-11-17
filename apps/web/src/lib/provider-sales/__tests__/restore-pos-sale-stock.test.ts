import { describe, expect, it } from "vitest";
import {
  decrementPosSaleStock,
  posSaleRefundShouldRestoreStock,
  posSaleTracksProductStock,
  restorePosSaleStock,
} from "../pos-product-stock";

describe("posSaleRefundShouldRestoreStock", () => {
  it("puts stock back only for a completed till sale", () => {
    expect(posSaleRefundShouldRestoreStock({ payment_status: "completed" })).toBe(true);
    expect(posSaleRefundShouldRestoreStock({ payment_status: "pending" })).toBe(false);
    expect(posSaleRefundShouldRestoreStock({ payment_status: "refunded" })).toBe(false);
    expect(
      posSaleRefundShouldRestoreStock({
        payment_status: "completed",
        notes: "booking_collection:booking-1",
      }),
    ).toBe(false);
    expect(posSaleTracksProductStock(null)).toBe(true);
    expect(posSaleTracksProductStock("booking_collection:booking-1")).toBe(false);
  });
});

describe("decrementPosSaleStock", () => {
  it("takes the sold units when the till sale is completed", async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const supabase = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = async () => ({ data: { track_stock_quantity: true }, error: null });
        chain.then = (onFulfilled: (value: { data: unknown; error: null }) => unknown) =>
          Promise.resolve(
            onFulfilled({
              data:
                table === "sale_items"
                  ? [{ item_type: "product", item_id: "shampoo", product_variant_id: null, quantity: 2 }]
                  : [],
              error: null,
            }),
          );
        return chain;
      },
      async rpc(name: string, args: Record<string, unknown>) {
        rpcCalls.push({ name, args });
        return { error: null };
      },
    };

    await decrementPosSaleStock(supabase, "sale-1");

    expect(rpcCalls).toEqual([
      { name: "decrement_product_stock", args: { p_product_id: "shampoo", p_quantity: 2 } },
    ]);
  });
});

describe("restorePosSaleStock", () => {
  it("puts the sold units back once", async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const inserts: unknown[] = [];
    let movements: Array<Record<string, unknown>> = [];
    const supabase = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = async () => {
          if (table === "products") return { data: { track_stock_quantity: true, quantity: 8 }, error: null };
          return { data: null, error: null };
        };
        chain.then = (onFulfilled: (value: { data: unknown; error: null }) => unknown) => {
          if (table === "sale_items") {
            return Promise.resolve(
              onFulfilled({
                data: [{ item_type: "product", item_id: "shampoo", product_variant_id: null, quantity: 2 }],
                error: null,
              }),
            );
          }
          if (table === "stock_movements") {
            return Promise.resolve(onFulfilled({ data: movements, error: null }));
          }
          return Promise.resolve(onFulfilled({ data: [], error: null }));
        };
        chain.insert = async (payload: Record<string, unknown>) => {
          inserts.push(payload);
          movements = [
            ...movements,
            {
              product_id: payload.product_id,
              product_variant_id: payload.product_variant_id,
              quantity_delta: payload.quantity_delta,
            },
          ];
          return { error: null };
        };
        return chain;
      },
      async rpc(name: string, args: Record<string, unknown>) {
        rpcCalls.push({ name, args });
        return { error: null };
      },
    };

    await restorePosSaleStock(supabase, { saleId: "sale-1", providerId: "prov-1" });
    await restorePosSaleStock(supabase, { saleId: "sale-1", providerId: "prov-1" });

    expect(rpcCalls).toEqual([
      { name: "increment_product_stock", args: { p_product_id: "shampoo", p_quantity: 2 } },
    ]);
    expect(inserts).toHaveLength(1);
  });

  it("does not record a restock when the quantity stays out", async () => {
    const inserts: unknown[] = [];
    const supabase = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = async () => {
          if (table === "products") return { data: { track_stock_quantity: true, quantity: 2 }, error: null };
          return { data: null, error: null };
        };
        chain.then = (onFulfilled: (value: { data: unknown; error: null }) => unknown) => {
          if (table === "sale_items") {
            return Promise.resolve(
              onFulfilled({
                data: [{ item_type: "product", item_id: "shampoo", product_variant_id: null, quantity: 2 }],
                error: null,
              }),
            );
          }
          return Promise.resolve(onFulfilled({ data: [], error: null }));
        };
        chain.insert = async (payload: unknown) => {
          inserts.push(payload);
          return { error: null };
        };
        return chain;
      },
      async rpc() {
        return { error: { message: "stock down" } };
      },
    };

    await expect(
      restorePosSaleStock(supabase, { saleId: "sale-1", providerId: "prov-1" }),
    ).rejects.toThrow(/could not be restored/);
    expect(inserts).toHaveLength(0);
  });

  it("takes the quantity back when the restock record cannot be saved", async () => {
    const rpcCalls: string[] = [];
    const supabase = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = async () => {
          if (table === "products") return { data: { track_stock_quantity: true, quantity: 4 }, error: null };
          return { data: null, error: null };
        };
        chain.then = (onFulfilled: (value: { data: unknown; error: null }) => unknown) => {
          if (table === "sale_items") {
            return Promise.resolve(
              onFulfilled({
                data: [{ item_type: "product", item_id: "shampoo", product_variant_id: null, quantity: 2 }],
                error: null,
              }),
            );
          }
          return Promise.resolve(onFulfilled({ data: [], error: null }));
        };
        chain.insert = async () => ({ error: { message: "log down" } });
        return chain;
      },
      async rpc(name: string) {
        rpcCalls.push(name);
        return { error: null };
      },
    };

    await expect(
      restorePosSaleStock(supabase, { saleId: "sale-1", providerId: "prov-1" }),
    ).rejects.toThrow(/could not be restored/);
    expect(rpcCalls).toEqual(["increment_product_stock", "decrement_product_stock"]);
  });
});
