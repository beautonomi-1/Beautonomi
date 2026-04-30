import { describe, expect, it } from "vitest";
import { calculateProductDeliveryFee, distanceKmBetween } from "../delivery-fee";

describe("calculateProductDeliveryFee", () => {
  it("applies flat delivery fee and free threshold", () => {
    expect(
      calculateProductDeliveryFee({
        subtotal: 250,
        config: { delivery_fee: 50, free_delivery_threshold: 500 },
      }).fee,
    ).toBe(50);
    expect(
      calculateProductDeliveryFee({
        subtotal: 500,
        config: { delivery_fee: 50, free_delivery_threshold: 500 },
      }).fee,
    ).toBe(0);
  });

  it("applies weight-based delivery fee from product weights", () => {
    const result = calculateProductDeliveryFee({
      subtotal: 100,
      config: { delivery_fee_type: "weight_based", delivery_fee: 20, weight_rate_per_kg: 15 },
      items: [{ quantity: 2, weight_grams: 500 }],
    });

    expect(result.totalWeightKg).toBe(1);
    expect(result.fee).toBe(35);
  });

  it("applies distance-based delivery fee when coordinates are available", () => {
    const result = calculateProductDeliveryFee({
      subtotal: 100,
      config: { delivery_fee_type: "distance_based", delivery_fee: 10, distance_rate_per_km: 5 },
      distanceKm: 7.5,
    });

    expect(result.fee).toBe(47.5);
  });

  it("calculates distance between coordinates", () => {
    const distance = distanceKmBetween(
      { latitude: -26.2041, longitude: 28.0473 },
      { latitude: -26.1076, longitude: 28.0567 },
    );

    expect(distance).toBeGreaterThan(10);
    expect(distance).toBeLessThan(12);
  });
});
