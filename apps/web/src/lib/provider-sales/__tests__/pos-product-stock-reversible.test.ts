import { describe, expect, it } from "vitest";
import { applyPosProductStockDecrementsReversible } from "../pos-product-stock";

function fakeSupabase(failOnSecondDecrement: boolean) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let decrements = 0;
  const supabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: { track_stock_quantity: true }, error: null };
        },
      };
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "decrement_product_stock") {
        decrements += 1;
        if (failOnSecondDecrement && decrements === 2) {
          return { error: { message: "out of stock" } };
        }
      }
      return { error: null };
    },
  };
  return { supabase, calls };
}

describe("applyPosProductStockDecrementsReversible", () => {
  it("puts back units already taken when a later line fails", async () => {
    const { supabase, calls } = fakeSupabase(true);
    await expect(
      applyPosProductStockDecrementsReversible(supabase, [
        { type: "product", item_id: "p1", quantity: 1 },
        { type: "product", item_id: "p2", quantity: 2 },
      ]),
    ).rejects.toThrow(/out of stock/);

    expect(calls.map((c) => c.name)).toEqual([
      "decrement_product_stock",
      "decrement_product_stock",
      "increment_product_stock",
    ]);
    expect(calls[2]?.args).toMatchObject({ p_product_id: "p1", p_quantity: 1 });
  });

  it("leaves stock taken when every line succeeds", async () => {
    const { supabase, calls } = fakeSupabase(false);
    await applyPosProductStockDecrementsReversible(supabase, [
      { type: "product", item_id: "p1", quantity: 1 },
    ]);
    expect(calls.map((c) => c.name)).toEqual(["decrement_product_stock"]);
  });
});
