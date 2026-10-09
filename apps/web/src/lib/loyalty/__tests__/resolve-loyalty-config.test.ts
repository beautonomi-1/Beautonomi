import { describe, expect, it, vi } from "vitest";
import { resolveLoyaltyConfig } from "../resolve-loyalty-config";

describe("resolveLoyaltyConfig", () => {
  it("loads active loyalty_point_config without currency filter (parity with validate-booking)", async () => {
    const pointConfig = {
      redemption_rate: 10,
      min_redemption_points: 50,
      max_redemption_percentage: 50,
      points_expiry_days: 365,
    };

    const from = vi.fn((table: string) => {
      if (table === "loyalty_rules") {
        const chain = {
          eq: () => chain,
          order: () => chain,
          limit: () => ({
            maybeSingle: async () => ({
              data: {
                points_per_currency_unit: 1,
                redemption_rate: 100,
                currency: "ZAR",
              },
              error: null,
            }),
          }),
        };
        return { select: () => chain };
      }
      if (table === "loyalty_point_config") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: pointConfig, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const cfg = await resolveLoyaltyConfig({ from } as any, "ZAR");

    expect(cfg.redemptionRate).toBe(10);
    expect(cfg.minRedemptionPoints).toBe(50);
    expect(cfg.maxRedemptionPercentage).toBe(50);
  });
});
