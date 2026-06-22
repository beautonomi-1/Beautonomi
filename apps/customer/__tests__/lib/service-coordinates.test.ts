import { hasValidServiceCoordinates } from "@/providers/SelectedAddressProvider";

describe("hasValidServiceCoordinates", () => {
  it("accepts finite lat/lng within range", () => {
    expect(hasValidServiceCoordinates({ latitude: -33.9, longitude: 18.4 })).toBe(true);
  });

  it("rejects null, missing, NaN, and 0,0", () => {
    expect(hasValidServiceCoordinates(null)).toBe(false);
    expect(hasValidServiceCoordinates(undefined)).toBe(false);
    expect(hasValidServiceCoordinates({ latitude: NaN, longitude: 18 })).toBe(false);
    expect(hasValidServiceCoordinates({ latitude: 0, longitude: 0 })).toBe(false);
  });
});
