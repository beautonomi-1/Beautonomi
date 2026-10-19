import { describe, expect, it, vi } from "vitest";
import { resolveSaleEntityTarget } from "../resolve-sale-entity-target";

describe("resolveSaleEntityTarget", () => {
  it("returns product_order when sale id is a walk-in product order", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "sales") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: "order-1" } }),
                }),
              }),
            }),
          }),
        };
      }),
    };

    const result = await resolveSaleEntityTarget(
      admin as never,
      "prov-1",
      "sale",
      "order-1",
    );
    expect(result).toEqual({ entityType: "product_order", entityId: "order-1" });
  });
});
