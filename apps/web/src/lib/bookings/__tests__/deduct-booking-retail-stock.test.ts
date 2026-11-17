import { describe, expect, it } from "vitest";
import {
  deductBookingRetailStock,
  lineUpBookingStockWithSavedStatus,
  restoreBookingRetailStock,
  undoUnsavedBookingStock,
} from "../deduct-booking-retail-stock";

describe("deductBookingRetailStock", () => {
  it("takes the units once and leaves the visit able to retry the rest", async () => {
    const rpcCalls: string[] = [];
    const stamps: string[] = [];
    let oilAttempts = 0;
    const rows = [
      {
        id: "line-1",
        product_id: "shampoo",
        product_variant_id: null,
        quantity: 1,
        products: { track_stock_quantity: true },
        stock_deducted_at: null as string | null,
      },
      {
        id: "line-2",
        product_id: "oil",
        product_variant_id: null,
        quantity: 1,
        products: { track_stock_quantity: true },
        stock_deducted_at: null as string | null,
      },
    ];
    const supabase = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = async () => ({
          data: rows.filter((row) => row.stock_deducted_at == null),
          error: null,
        });
        chain.update = (payload: { stock_deducted_at?: string | null }) => ({
          eq: (_col: string, id: string) => {
            const apply = async () => {
              const row = rows.find((item) => item.id === id);
              if (!row) return { data: [], error: null };
              if (payload.stock_deducted_at) {
                if (row.stock_deducted_at) return { data: [], error: null };
                row.stock_deducted_at = payload.stock_deducted_at;
                stamps.push(id);
                return { data: [{ id }], error: null };
              }
              row.stock_deducted_at = null;
              return { data: [{ id }], error: null };
            };
            const next: Record<string, unknown> = {};
            next.eq = () => next;
            next.is = () => next;
            next.select = () => apply();
            next.then = (onFulfilled: (value: unknown) => unknown) => apply().then(onFulfilled);
            return next;
          },
        });
        return chain;
      },
      async rpc(name: string, args: { p_product_id?: string }) {
        rpcCalls.push(`${name}:${args.p_product_id}`);
        if (args.p_product_id === "oil") {
          oilAttempts += 1;
          if (oilAttempts === 1) return { error: { message: "Not enough oil" } };
        }
        return { error: null };
      },
    };

    await expect(deductBookingRetailStock(supabase as never, "booking-1")).rejects.toThrow(
      "Product stock could not be deducted",
    );
    await deductBookingRetailStock(supabase as never, "booking-1");

    expect(rpcCalls).toEqual([
      "decrement_product_stock:shampoo",
      "decrement_product_stock:oil",
      "decrement_product_stock:oil",
    ]);
    expect(rows.map((row) => row.stock_deducted_at != null)).toEqual([true, true]);
  });

  it("returns deducted units once and retries only what is still out", async () => {
    const rpcCalls: string[] = [];
    const rows = [
      { id: "line-1", product_id: "shampoo", product_variant_id: null, quantity: 1, stock_deducted_at: "t" as string | null },
      { id: "line-2", product_id: "oil", product_variant_id: null, quantity: 1, stock_deducted_at: "t" as string | null },
    ];
    let oilAttempts = 0;
    const supabase = {
      from() {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.not = async () => ({
          data: rows.filter((row) => row.stock_deducted_at != null),
          error: null,
        });
        chain.update = (payload: { stock_deducted_at?: string | null }) => ({
          eq: (_col: string, id: string) => {
            const apply = async () => {
              const row = rows.find((item) => item.id === id);
              if (!row) return { data: [], error: null };
              if (payload.stock_deducted_at) {
                row.stock_deducted_at = payload.stock_deducted_at;
                return { data: [{ id }], error: null };
              }
              if (!row.stock_deducted_at) return { data: [], error: null };
              row.stock_deducted_at = null;
              return { data: [{ id }], error: null };
            };
            const next: Record<string, unknown> = {};
            next.eq = () => next;
            next.is = () => next;
            next.not = () => next;
            next.select = () => apply();
            next.then = (onFulfilled: (value: unknown) => unknown) => apply().then(onFulfilled);
            return next;
          },
        });
        return chain;
      },
      async rpc(name: string, args: { p_product_id?: string }) {
        rpcCalls.push(`${name}:${args.p_product_id}`);
        if (args.p_product_id === "oil") {
          oilAttempts += 1;
          if (oilAttempts === 1) return { error: { message: "Oil could not be returned" } };
        }
        return { error: null };
      },
    };

    await expect(restoreBookingRetailStock(supabase as never, "booking-1")).rejects.toThrow(
      "Product stock could not be restored",
    );
    await restoreBookingRetailStock(supabase as never, "booking-1");

    expect(rpcCalls).toEqual([
      "increment_product_stock:shampoo",
      "increment_product_stock:oil",
      "increment_product_stock:oil",
    ]);
    expect(rows.map((row) => row.stock_deducted_at)).toEqual([null, null]);
  });

  it("puts units back when the taken mark cannot be saved", async () => {
    const rpcCalls: string[] = [];
    const rows = [
      {
        id: "line-1",
        product_id: "shampoo",
        product_variant_id: null,
        quantity: 1,
        products: { track_stock_quantity: true },
        stock_deducted_at: null as string | null,
      },
    ];
    const supabase = {
      from() {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = async () => ({ data: rows, error: null });
        chain.update = () => ({
          eq: () => ({
            is: () => ({
              select: async () => ({ data: null, error: { message: "could not stamp" } }),
            }),
          }),
        });
        return chain;
      },
      async rpc(name: string, args: { p_product_id?: string }) {
        rpcCalls.push(`${name}:${args.p_product_id}`);
        return { error: null };
      },
    };

    await expect(deductBookingRetailStock(supabase as never, "booking-1")).rejects.toThrow(
      "could not stamp",
    );
    expect(rpcCalls).toEqual([]);
    expect(rows[0].stock_deducted_at).toBeNull();
  });

  it("updates the product quantity when the return call fails after the taken mark is cleared", async () => {
    const quantities: number[] = [];
    let stamp: string | null = "taken";
    const supabase = {
      from(table: string) {
        if (table === "products") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { quantity: 4 }, error: null }),
              }),
            }),
            update: (payload: { quantity: number }) => ({
              eq: () => ({
                eq: () => ({
                  select: async () => {
                    quantities.push(payload.quantity);
                    return { data: [{ id: "shampoo" }], error: null };
                  },
                }),
              }),
            }),
          };
        }
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.not = async () => ({
          data: stamp
            ? [{ id: "line-1", product_id: "shampoo", product_variant_id: null, quantity: 1 }]
            : [],
          error: null,
        });
        chain.update = (payload: { stock_deducted_at?: string | null }) => ({
          eq: () => {
            const apply = async () => {
              if (payload.stock_deducted_at) {
                stamp = payload.stock_deducted_at;
                return { data: [{ id: "line-1" }], error: null };
              }
              if (!stamp) return { data: [], error: null };
              stamp = null;
              return { data: [{ id: "line-1" }], error: null };
            };
            const next: Record<string, unknown> = {};
            next.not = () => next;
            next.is = () => next;
            next.select = () => apply();
            next.then = (onFulfilled: (value: unknown) => unknown) => apply().then(onFulfilled);
            return next;
          },
        });
        return chain;
      },
      async rpc(name: string) {
        if (name.startsWith("increment")) return { error: { message: "stock down" } };
        return { error: null };
      },
    };

    await restoreBookingRetailStock(supabase as never, "booking-1");
    expect(quantities).toEqual([5]);
    expect(stamp).toBeNull();
  });
});

describe("undoUnsavedBookingStock", () => {
  function stockClient(initialStamp: string | null) {
    let stamp = initialStamp;
    const rpcCalls: string[] = [];
    const supabase = {
      from() {
        return {
          update: (payload: { stock_deducted_at?: string | null }) => ({
            eq: () => {
              const apply = async () => {
                if (payload.stock_deducted_at) {
                  if (stamp) return { data: [], error: null };
                  stamp = payload.stock_deducted_at;
                  return { data: [{ id: "line-1" }], error: null };
                }
                if (!stamp) return { data: [], error: null };
                stamp = null;
                return { data: [{ id: "line-1" }], error: null };
              };
              const next: Record<string, unknown> = {};
              next.eq = () => next;
              next.is = () => next;
              next.not = () => next;
              next.select = () => apply();
              return next;
            },
          }),
        };
      },
      async rpc(name: string) {
        rpcCalls.push(name);
        return { error: null };
      },
    };
    return { supabase, rpcCalls, stamp: () => stamp };
  }

  const line = { id: "line-1", productId: "shampoo", variantId: null, quantity: 1 };

  it("takes a returned line back when the visit was not saved", async () => {
    const client = stockClient(null);
    await undoUnsavedBookingStock(client.supabase as never, [], [line]);
    expect(client.rpcCalls).toEqual(["decrement_product_stock"]);
    expect(client.stamp()).toEqual(expect.any(String));
  });

  it("leaves a line another save already took", async () => {
    const client = stockClient("held");
    await undoUnsavedBookingStock(client.supabase as never, [], [line]);
    expect(client.rpcCalls).toEqual([]);
    expect(client.stamp()).toBe("held");
  });
});

describe("lineUpBookingStockWithSavedStatus", () => {
  function client(status: string) {
    const rpcCalls: string[] = [];
    let stamp: string | null = null;
    const supabase = {
      from(table: string) {
        if (table === "bookings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { status }, error: null }),
              }),
            }),
          };
        }
        return {
          update: (payload: { stock_deducted_at?: string | null }) => ({
            eq: () => {
              const apply = async () => {
                if (payload.stock_deducted_at) {
                  if (stamp) return { data: [], error: null };
                  stamp = payload.stock_deducted_at;
                  return { data: [{ id: "line-1" }], error: null };
                }
                if (!stamp) return { data: [], error: null };
                stamp = null;
                return { data: [{ id: "line-1" }], error: null };
              };
              const next: Record<string, unknown> = {};
              next.eq = () => next;
              next.is = () => next;
              next.not = () => next;
              next.select = () => apply();
              return next;
            },
          }),
        };
      },
      async rpc(name: string) {
        rpcCalls.push(name);
        return { error: null };
      },
    };
    return { supabase, rpcCalls };
  }

  const line = { id: "line-1", productId: "shampoo", variantId: null, quantity: 1 };

  it("leaves returned units when the visit was cancelled", async () => {
    const booked = client("cancelled");
    await lineUpBookingStockWithSavedStatus(booked.supabase as never, "booking-1", [], [line]);
    expect(booked.rpcCalls).toEqual([]);
  });

  it("takes returned units back when the visit is still open", async () => {
    const booked = client("confirmed");
    await lineUpBookingStockWithSavedStatus(booked.supabase as never, "booking-1", [], [line]);
    expect(booked.rpcCalls).toEqual(["decrement_product_stock"]);
  });
});
