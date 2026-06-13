import { describe, expect, it } from "vitest";
import { z } from "zod";

/** Mirrors PATCH /api/admin/loyalty/config body schema. */
const loyaltyConfigPatchSchema = z.object({
  redemption_rate: z.number().positive().optional(),
  min_redemption_points: z.number().int().nonnegative().optional(),
  max_redemption_percentage: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
});

describe("loyalty config PATCH schema", () => {
  it("accepts valid redemption settings", () => {
    const parsed = loyaltyConfigPatchSchema.parse({
      redemption_rate: 10,
      min_redemption_points: 50,
      max_redemption_percentage: 50,
    });
    expect(parsed.redemption_rate).toBe(10);
    expect(parsed.min_redemption_points).toBe(50);
  });

  it("rejects non-positive redemption_rate", () => {
    expect(() => loyaltyConfigPatchSchema.parse({ redemption_rate: 0 })).toThrow();
    expect(() => loyaltyConfigPatchSchema.parse({ redemption_rate: -5 })).toThrow();
  });

  it("rejects max_redemption_percentage above 100", () => {
    expect(() =>
      loyaltyConfigPatchSchema.parse({ max_redemption_percentage: 101 })
    ).toThrow();
  });

  it("rejects negative min_redemption_points", () => {
    expect(() =>
      loyaltyConfigPatchSchema.parse({ min_redemption_points: -1 })
    ).toThrow();
  });

  it("allows partial patch with redemption_rate only", () => {
    const parsed = loyaltyConfigPatchSchema.parse({ redemption_rate: 100 });
    expect(parsed.redemption_rate).toBe(100);
    expect(parsed.min_redemption_points).toBeUndefined();
  });
});
