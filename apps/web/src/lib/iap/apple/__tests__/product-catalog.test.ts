import { describe, expect, it } from "vitest";
import {
  computeAppleTargetPriceZar,
  DEFAULT_APPLE_COMMISSION_RATE,
  nearestApplePricePointZar,
  subscriptionProductId,
} from "../product-catalog";

describe("computeAppleTargetPriceZar", () => {
  it("returns 0 for non-positive web prices", () => {
    expect(computeAppleTargetPriceZar(0)).toBe(0);
    expect(computeAppleTargetPriceZar(-10)).toBe(0);
  });

  it("grosses up web price by default 15% commission", () => {
    expect(computeAppleTargetPriceZar(99)).toBe(116.47);
    expect(computeAppleTargetPriceZar(99, DEFAULT_APPLE_COMMISSION_RATE)).toBe(116.47);
  });

  it("respects a custom commission rate", () => {
    expect(computeAppleTargetPriceZar(100, 0.3)).toBe(142.86);
  });
});

describe("nearestApplePricePointZar", () => {
  it("returns the first ladder tier at or above the target", () => {
    expect(nearestApplePricePointZar(116.47)).toBe(119.99);
    expect(nearestApplePricePointZar(99)).toBe(99.99);
    expect(nearestApplePricePointZar(4.99)).toBe(4.99);
  });

  it("ceil-falls back when target exceeds the ladder", () => {
    expect(nearestApplePricePointZar(5000)).toBe(5000);
  });
});

describe("subscriptionProductId", () => {
  it("builds monthly and yearly product IDs from plan slugs", () => {
    expect(subscriptionProductId("beautonomi-growth", "monthly")).toBe(
      "com.beautonomi.partner.sub.growth.monthly",
    );
    expect(subscriptionProductId("beautonomi-scale", "yearly")).toBe(
      "com.beautonomi.partner.sub.scale.yearly",
    );
  });

  it("accepts slugs without the beautonomi- prefix", () => {
    expect(subscriptionProductId("growth", "monthly")).toBe(
      "com.beautonomi.partner.sub.growth.monthly",
    );
  });
});
