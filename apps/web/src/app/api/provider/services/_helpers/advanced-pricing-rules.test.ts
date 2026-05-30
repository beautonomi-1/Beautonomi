import { describe, expect, it } from "vitest";
import {
  isMissingColumnError,
  normalizeAdvancedPricingRules,
} from "./advanced-pricing-rules";

describe("normalizeAdvancedPricingRules", () => {
  it("returns empty array for non-array input", () => {
    expect(normalizeAdvancedPricingRules(null)).toEqual([]);
    expect(normalizeAdvancedPricingRules({})).toEqual([]);
  });

  it("normalizes rule shape for JSONB storage", () => {
    const rules = normalizeAdvancedPricingRules([
      {
        id: "rule-1",
        type: "time_based",
        name: " Peak ",
        enabled: true,
        conditions: { days: ["Monday"], startTime: "09:00", endTime: "17:00" },
        priceAdjustment: { type: "percentage", value: 10 },
      },
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe("Peak");
    expect(rules[0].priceAdjustment).toEqual({ type: "percentage", value: 10 });
  });

  it("coerces invalid adjustment values to zero", () => {
    const rules = normalizeAdvancedPricingRules([
      { name: "X", priceAdjustment: { type: "fixed", value: "nope" } },
    ]);
    expect(rules[0].priceAdjustment?.value).toBe(0);
  });
});

describe("isMissingColumnError", () => {
  it("detects PostgREST schema cache errors", () => {
    expect(
      isMissingColumnError(
        {
          code: "PGRST204",
          message:
            "Could not find the 'advanced_pricing_rules' column of 'offerings' in the schema cache",
        },
        "advanced_pricing_rules",
      ),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isMissingColumnError({ message: "duplicate key value" }, "advanced_pricing_rules")).toBe(
      false,
    );
  });
});
