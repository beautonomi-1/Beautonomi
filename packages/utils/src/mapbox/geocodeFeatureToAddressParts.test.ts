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

  it("stores Mapbox suburb in address_line2 when metro city is separate", () => {
    const parsed = mapGeocodeFeatureToAddressParts(
      {
        place_name: "12 Long Street, Gardens, Cape Town, Western Cape 8001, South Africa",
        text: "Long Street",
        address: "12",
        center: [18.42, -33.92],
        context: [
          { id: "neighborhood.1", text: "Gardens" },
          { id: "place.1", text: "Cape Town" },
          { id: "region.1", text: "Western Cape" },
          { id: "postcode.1", text: "8001" },
          { id: "country.1", text: "South Africa" },
        ],
      },
      { defaultCountryName: "South Africa" },
    );

    expect(parsed).toMatchObject({
      address_line1: "12 Long Street",
      address_line2: "Gardens",
      city: "Cape Town",
    });
  });
});
