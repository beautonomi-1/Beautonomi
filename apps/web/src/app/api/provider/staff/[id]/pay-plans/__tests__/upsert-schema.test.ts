import { describe, expect, it } from "vitest";
import { payPlanUpsertSchema } from "../route";

const base = {
  effective_from: "2026-11-10",
  pay_model: "commission_only" as const,
};

describe("pay plan upsert schema (F3-21)", () => {
  it("rejects a tier commission_rate above 100", () => {
    const result = payPlanUpsertSchema.safeParse({
      ...base,
      tiers: [{ min_revenue: 0, commission_rate: 150 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative tier commission_rate", () => {
    const result = payPlanUpsertSchema.safeParse({
      ...base,
      tiers: [{ commission_rate: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a tier commission_rate of 40 and a service_rate of 40", () => {
    const result = payPlanUpsertSchema.safeParse({
      ...base,
      service_rate: 40,
      tiers: [{ min_revenue: 0, commission_rate: 40 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tiers?.[0]?.commission_rate).toBe(40);
    }
  });

  it("rejects service_rate and product_rate outside 0–100", () => {
    expect(payPlanUpsertSchema.safeParse({ ...base, service_rate: 150 }).success).toBe(false);
    expect(payPlanUpsertSchema.safeParse({ ...base, product_rate: -1 }).success).toBe(false);
  });
});
