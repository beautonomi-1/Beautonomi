import { describe, expect, it } from "vitest";
import {
  dedupePricingPlansBySubscriptionId,
  filterPricingPlansByActiveSubscriptions,
  isLegacyUnlinkedPricingPlanName,
} from "../published-pricing-plans";

describe("published-pricing-plans", () => {
  const active = new Set(["sub-free", "sub-growth", "sub-scale"]);

  it("drops unlinked legacy rows", () => {
    const rows = [
      { id: "1", name: "Starter", subscription_plan_id: null },
      { id: "1b", name: "Starter", subscription_plan_id: "" },
      { id: "2", name: "Beautonomi Starter", subscription_plan_id: "sub-free" },
    ];
    const out = filterPricingPlansByActiveSubscriptions(rows, active);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("2");
  });

  it("dedupes by subscription_plan_id keeping lower display_order", () => {
    const rows = [
      { id: "a", subscription_plan_id: "sub-growth", display_order: 2 },
      { id: "b", subscription_plan_id: "sub-growth", display_order: 1 },
    ];
    const out = dedupePricingPlansBySubscriptionId(rows);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b");
  });

  it("sorts by display_order after dedupe", () => {
    const rows = [
      { id: "scale", subscription_plan_id: "sub-scale", display_order: 2 },
      { id: "free", subscription_plan_id: "sub-free", display_order: 0 },
      { id: "growth", subscription_plan_id: "sub-growth", display_order: 1 },
    ];
    const out = dedupePricingPlansBySubscriptionId(rows);
    expect(out.map((r) => r.id)).toEqual(["free", "growth", "scale"]);
  });

  it("flags legacy CMS names", () => {
    expect(isLegacyUnlinkedPricingPlanName("Starter")).toBe(true);
    expect(isLegacyUnlinkedPricingPlanName("Beautonomi Starter")).toBe(false);
  });
});
