import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decrementStockQuantity,
  incrementStockQuantity,
  restockProductOrderLineItems,
} from "../product-order-lifecycle";

function restockClient(options: {
  rpcError?: { message: string } | null;
  fallbackError?: { message: string } | null;
  movementError?: { message: string } | null;
}) {
  const movements: unknown[] = [];
  const rpcCalls: string[] = [];
  const from = (table: string) => {
    if (table === "product_order_items") {
      return {
        select: () => ({
          eq: async () => ({
            data: [
              { id: "item-1", product_id: "prod-1", product_variant_id: null, quantity: 2 },
            ],
          }),
        }),
      };
    }
    if (table === "stock_movements") {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.then = (onFulfilled: (value: { data: never[] }) => unknown) =>
        Promise.resolve(onFulfilled({ data: [] }));
      chain.insert = async (row: unknown) => {
        movements.push(row);
        return { error: options.movementError ?? null };
      };
      return chain;
    }
    if (table === "product_orders") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { order_source: "online", delivered_at: null, provider_id: "prov-1" },
            }),
          }),
        }),
      };
    }
    if (table === "products") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: options.fallbackError ? null : { quantity: 4 },
              error: options.fallbackError ?? null,
            }),
            maybeSingle: async () => ({ data: { quantity: 6 } }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: options.fallbackError ?? null }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  };
  return {
    client: {
      from,
      rpc: async (name: string) => {
        rpcCalls.push(name);
        if (name.startsWith("decrement")) return { error: null };
        return { error: options.rpcError ?? null };
      },
    } as unknown as SupabaseClient,
    movements,
    rpcCalls,
  };
}

describe("restockProductOrderLineItems", () => {
  it("writes a stock movement after the quantity is put back", async () => {
    const { client, movements } = restockClient({});
    await restockProductOrderLineItems(client, "order-1");
    expect(movements).toHaveLength(1);
  });

  it("does not record a restock when the quantity update fails", async () => {
    const { client, movements } = restockClient({
      rpcError: { message: "stock down" },
      fallbackError: { message: "stock down" },
    });
    await restockProductOrderLineItems(client, "order-1");
    expect(movements).toHaveLength(0);
  });

  it("takes the quantity back when the restock record cannot be saved", async () => {
    const { client, rpcCalls } = restockClient({
      movementError: { message: "log down" },
    });
    await restockProductOrderLineItems(client, "order-1");
    expect(rpcCalls).toContain("decrement_product_stock");
  });
});

describe("stock quantity fallback", () => {
  it("adds the units onto a newer quantity when the stock call fails", async () => {
    let shelf = 9;
    const reads = [4, 9];
    let readAt = 0;
    const written: number[] = [];
    const supabase = {
      async rpc() {
        return { error: { message: "stock down" } };
      },
      from() {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { quantity: reads[readAt++] ?? shelf },
                error: null,
              }),
            }),
          }),
          update: (payload: { quantity: number }) => ({
            eq: () => ({
              eq: (_column: string, expected: number) => ({
                select: async () => {
                  if (shelf !== expected) return { data: [], error: null };
                  shelf = payload.quantity;
                  written.push(payload.quantity);
                  return { data: [{ id: "prod-1" }], error: null };
                },
              }),
            }),
          }),
        };
      },
    };

    const restored = await incrementStockQuantity(
      supabase as unknown as SupabaseClient,
      { variantId: null, productId: "prod-1" },
      1,
    );
    expect(restored).toBe(true);
    expect(written).toEqual([10]);
    expect(shelf).toBe(10);
  });

  it("leaves the quantity when three newer counts win", async () => {
    let shelf = 9;
    const written: number[] = [];
    const supabase = {
      async rpc() {
        return { error: { message: "stock down" } };
      },
      from() {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { quantity: 4 }, error: null }),
            }),
          }),
          update: (payload: { quantity: number }) => ({
            eq: () => ({
              eq: (_column: string, expected: number) => ({
                select: async () => {
                  if (shelf !== expected) return { data: [], error: null };
                  shelf = payload.quantity;
                  written.push(payload.quantity);
                  return { data: [{ id: "prod-1" }], error: null };
                },
              }),
            }),
          }),
        };
      },
    };

    const restored = await incrementStockQuantity(
      supabase as unknown as SupabaseClient,
      { variantId: null, productId: "prod-1" },
      1,
    );
    expect(restored).toBe(false);
    expect(written).toEqual([]);
    expect(shelf).toBe(9);
  });

  it("does not take units the shelf no longer has", async () => {
    const written: number[] = [];
    const supabase = {
      async rpc() {
        return { error: { message: "stock down" } };
      },
      from() {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { quantity: 1 }, error: null }),
            }),
          }),
          update: (payload: { quantity: number }) => ({
            eq: () => ({
              eq: () => ({
                select: async () => {
                  written.push(payload.quantity);
                  return { data: [{ id: "prod-1" }], error: null };
                },
              }),
            }),
          }),
        };
      },
    };

    const taken = await decrementStockQuantity(
      supabase as unknown as SupabaseClient,
      { variantId: null, productId: "prod-1" },
      2,
    );
    expect(taken).toBe(false);
    expect(written).toEqual([]);
  });
});
