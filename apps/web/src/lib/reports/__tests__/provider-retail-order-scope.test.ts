import { describe, expect, it } from "vitest";
import {
  isProviderCollectedRetailOrder,
  providerCollectedRetailOrdersOrFilter,
  PROVIDER_COLLECTED_RETAIL_PAYMENT_METHODS,
} from "../provider-retail-order-scope";

describe("provider-retail-order-scope", () => {
  it("builds supabase or filter for walk-in and provider-collected online", () => {
    expect(providerCollectedRetailOrdersOrFilter()).toContain("order_source.eq.walk_in");
    expect(providerCollectedRetailOrdersOrFilter()).toContain("order_source.eq.online");
    for (const method of PROVIDER_COLLECTED_RETAIL_PAYMENT_METHODS) {
      expect(providerCollectedRetailOrdersOrFilter()).toContain(method);
    }
  });

  it("classifies walk-in and COD online as provider-collected", () => {
    expect(isProviderCollectedRetailOrder({ order_source: "walk_in" })).toBe(true);
    expect(
      isProviderCollectedRetailOrder({ order_source: "online", payment_method: "cash" }),
    ).toBe(true);
    expect(
      isProviderCollectedRetailOrder({ order_source: "online", payment_method: "paystack" }),
    ).toBe(false);
    expect(
      isProviderCollectedRetailOrder({ order_source: "appointment", payment_method: "cash" }),
    ).toBe(false);
  });
});
