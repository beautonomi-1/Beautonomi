import { describe, it, expect, vi } from "vitest";
import {
  feeReconciliationDateBounds,
  normalizeGatewayName,
  computeGatewayFeeSuggestions,
} from "../fee-reconciliation-compute";

describe("feeReconciliationDateBounds", () => {
  it("returns inclusive UTC day bounds", () => {
    expect(feeReconciliationDateBounds("2026-01-01", "2026-01-31")).toEqual({
      startIso: "2026-01-01T00:00:00.000Z",
      endIso: "2026-01-31T23:59:59.999Z",
    });
  });

  it("rejects invalid or reversed ranges", () => {
    expect(() => feeReconciliationDateBounds("bad", "2026-01-01")).toThrow(/YYYY-MM-DD/);
    expect(() => feeReconciliationDateBounds("2026-02-01", "2026-01-01")).toThrow(/start_date/);
  });
});

describe("normalizeGatewayName", () => {
  it("lowercases and trims", () => {
    expect(normalizeGatewayName(" Paystack ")).toBe("paystack");
  });
});

describe("computeGatewayFeeSuggestions", () => {
  it("sums charge fees and expected config fees for the gateway only", async () => {
    const rpc = vi.fn(async (_name: string, args: { transaction_amount: number }) => {
      if (args.transaction_amount === 100) return { data: 2.9, error: null };
      if (args.transaction_amount === 200) return { data: 5.8, error: null };
      return { data: 0, error: null };
    });

    const supabase = {
      from: (table: string) => {
        if (table === "payment_transactions") {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  gte: () => ({
                    lte: async () => ({
                      data: [
                        { amount: 100, fees: 3.0 },
                        { amount: 200, fees: 6.0 },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "finance_transactions") {
          return {
            select: () => ({
              eq: () => ({
                gte: () => ({
                  lte: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
      rpc,
    };

    const result = await computeGatewayFeeSuggestions(
      supabase as never,
      "paystack",
      "2026-01-01",
      "2026-01-31",
    );

    expect(result.charge_count).toBe(2);
    expect(result.recorded_fees).toBe(9);
    expect(result.expected_fees_from_config).toBe(8.7);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
