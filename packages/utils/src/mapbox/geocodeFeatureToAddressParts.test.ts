import { describe, expect, it } from "vitest";
import { mapGeocodeFeatureToAddressParts } from "./geocodeFeatureToAddressParts";

describe("mapGeocodeFeatureToAddressParts", () => {
  it("preserves South African number-first street addresses", () => {
    const parsed = mapGeocodeFeatureToAddressParts(
      {
        place_name: "12 Viljoen Street, Pretoria, Gauteng 0083, South Africa",
        text: "Viljoen Street",
        address: "12",
        center: [28.235444, -25.746111],
        context: [
          { id: "place.123", text: "Pretoria" },
          { id: "region.123", text: "Gauteng" },
          { id: "postcode.123", text: "0083" },
          { id: "country.123", text: "South Africa", short_code: "za" },
        ],
      },
      { defaultCountryName: "South Africa" },
    );

    expect(parsed).toMatchObject({
      address_line1: "12 Viljoen Street",
      city: "Pretoria",
      state: "Gauteng",
      postal_code: "0083",
      country: "South Africa",
      latitude: -25.746111,
      longitude: 28.235444,
    });
  });

  it("uses the first display segment when no structured street number is returned", () => {
    const parsed = mapGeocodeFeatureToAddressParts({
      place_name: "12 Viljoen Street, Pretoria, Gauteng, South Africa",
      center: [28.235444, -25.746111],
    });

    expect(parsed.address_line1).toBe("12 Viljoen Street");
    expect(parsed.city).toBe("Pretoria");
  });
});
