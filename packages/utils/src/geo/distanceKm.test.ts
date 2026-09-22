import { describe, expect, it } from "vitest";
import { distanceKmBetween } from "./distanceKm";

describe("distanceKmBetween", () => {
  it("returns null when a coordinate is missing", () => {
    expect(distanceKmBetween({ latitude: -26.2, longitude: 28.0 }, { latitude: -26.1 })).toBeNull();
  });

  it("computes Johannesburg to Pretoria-scale distance", () => {
    const km = distanceKmBetween(
      { latitude: -26.2041, longitude: 28.0473 },
      { latitude: -25.7479, longitude: 28.2293 },
    );
    expect(km).toBeGreaterThan(40);
    expect(km).toBeLessThan(70);
  });
});
