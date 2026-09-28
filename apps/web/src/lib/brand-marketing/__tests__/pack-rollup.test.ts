import { describe, expect, it } from "vitest";
import { rollupTenantBrandPack } from "../pack-rollup";

describe("pack rollup", () => {
  it("returns empty totals when no campaigns", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "brand_campaigns") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [] }),
            }),
          };
        }
        if (table === "brand_placements") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [] }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await rollupTenantBrandPack(
      supabase as never,
      "00000000-0000-0000-0000-000000000001",
      { start: new Date("2026-01-01"), end: new Date("2026-01-31") },
    );
    expect(result.totals.campaign_count).toBe(0);
    expect(result.totals.attributed_signups).toBe(0);
    expect(result.demand.length).toBeGreaterThan(0);
  });
});
