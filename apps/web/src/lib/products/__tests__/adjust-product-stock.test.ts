import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adjustProductStock } from "../stock-movements";

function stockClient(options: {
  readQuantity: number;
  shelf: number;
  movementError?: string | null;
  afterClaim?: (shelf: number) => number;
}) {
  let shelf = options.shelf;
  const written: number[] = [];
  let inserts = 0;
  const supabase = {
    from(table: string) {
      if (table === "products") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "prod-1",
                    quantity: options.readQuantity,
                    provider_id: "prov-1",
                    has_variants: false,
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: (payload: { quantity: number }) => ({
            eq: () => ({
              eq: (_col: string, expected: number) => ({
                select: async () => {
                  if (shelf !== expected) return { data: [], error: null };
                  shelf = payload.quantity;
                  written.push(payload.quantity);
                  if (options.afterClaim && payload.quantity !== options.readQuantity) {
                    shelf = options.afterClaim(shelf);
                  }
                  return { data: [{ id: "prod-1" }], error: null };
                },
              }),
            }),
          }),
        };
      }
      if (table === "stock_movements") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => {
                inserts += 1;
                if (options.movementError) {
                  return { data: null, error: { message: options.movementError } };
                }
                return { data: { id: "move-1" }, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(table);
    },
  };
  return {
    supabase: supabase as unknown as SupabaseClient,
    written: () => written,
    shelf: () => shelf,
    inserts: () => inserts,
  };
}

describe("adjustProductStock", () => {
  it("restores the previous quantity when the movement cannot be saved", async () => {
    const client = stockClient({ readQuantity: 4, shelf: 4, movementError: "log down" });

    await expect(
      adjustProductStock(client.supabase, {
        providerId: "prov-1",
        productId: "prod-1",
        delta: 2,
        movementType: "received",
      }),
    ).rejects.toThrow(/log down/);
    expect(client.written()).toEqual([6, 4]);
    expect(client.shelf()).toBe(4);
  });

  it("leaves a newer quantity when the movement fails after another change", async () => {
    const client = stockClient({
      readQuantity: 4,
      shelf: 4,
      movementError: "log down",
      afterClaim: () => 9,
    });

    await expect(
      adjustProductStock(client.supabase, {
        providerId: "prov-1",
        productId: "prod-1",
        delta: 2,
        movementType: "received",
      }),
    ).rejects.toThrow(/log down/);
    expect(client.written()).toEqual([6]);
    expect(client.shelf()).toBe(9);
  });

  it("does not write a movement when the quantity changed before the adjustment", async () => {
    const client = stockClient({ readQuantity: 4, shelf: 7, movementError: "log down" });

    await expect(
      adjustProductStock(client.supabase, {
        providerId: "prov-1",
        productId: "prod-1",
        delta: 2,
        movementType: "received",
      }),
    ).rejects.toThrow(/Stock changed before this adjustment was saved/);
    expect(client.written()).toEqual([]);
    expect(client.inserts()).toBe(0);
    expect(client.shelf()).toBe(7);
  });
});
