import { describe, expect, it, vi } from "vitest";
import { expectedGatewayFee } from "../expected-gateway-fee";

function makeFeeConfigQuery(result: { data: unknown[]; error?: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null }),
  };
  return chain;
}

describe("expectedGatewayFee", () => {
  it("returns 0 when no config row matches", async () => {
    const from = vi.fn().mockReturnValue(makeFeeConfigQuery({ data: [] }));
    const supabase = { from } as never;
    const fee = await expectedGatewayFee(supabase, "paystack", 100);
    expect(fee).toBe(0);
  });

  it("computes percentage fee from config row", async () => {
    const from = vi.fn().mockReturnValue(
      makeFeeConfigQuery({
        data: [
          {
            fee_type: "percentage",
            fee_percentage: 0.029,
            fee_fixed_amount: 0,
            fixed_fee_waiver_below: null,
            vat_rate: 0,
            fee_is_vat_exclusive: false,
            max_fee_amount: null,
            payment_method: "*",
            region: "local",
          },
        ],
      }),
    );
    const supabase = { from } as never;
    const fee = await expectedGatewayFee(supabase, "paystack", 100);
    expect(fee).toBeCloseTo(2.9, 2);
  });
});
