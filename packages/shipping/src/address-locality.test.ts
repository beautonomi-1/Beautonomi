import { describe, expect, it } from "vitest";
import { resolveCourierSuburb, toShiplogicApiLocality } from "./address-locality";
import type { Address } from "./index";

function addr(partial: Partial<Address> & Pick<Address, "line1" | "city" | "postalCode" | "country">): Address {
  return {
    name: "Test",
    ...partial,
  };
}

describe("resolveCourierSuburb", () => {
  it("uses line2 as suburb when it differs from metro city", () => {
    expect(
      resolveCourierSuburb(
        addr({
          line1: "12 Long",
          line2: "Gardens",
          city: "Cape Town",
          postalCode: "8001",
          country: "ZA",
        }),
      ),
    ).toBe("Gardens");
  });

  it("falls back to city when line2 is missing or matches city", () => {
    expect(
      resolveCourierSuburb(addr({ line1: "1 Main", city: "Cape Town", postalCode: "8001", country: "ZA" })),
    ).toBe("Cape Town");
    expect(
      resolveCourierSuburb(
        addr({ line1: "1 Main", line2: "Cape Town", city: "Cape Town", postalCode: "8001", country: "ZA" }),
      ),
    ).toBe("Cape Town");
  });

  it("ignores unit-style line2 for suburb (keeps metro city)", () => {
    expect(
      resolveCourierSuburb(
        addr({
          line1: "12 Long",
          line2: "Unit 4",
          city: "Cape Town",
          postalCode: "8001",
          country: "ZA",
        }),
      ),
    ).toBe("Cape Town");
  });
});

describe("toShiplogicApiLocality", () => {
  it("maps Gardens + Cape Town for ShipLogic fields", () => {
    expect(
      toShiplogicApiLocality(
        addr({
          line1: "12 Long",
          line2: "Gardens",
          city: "Cape Town",
          postalCode: "8001",
          country: "ZA",
        }),
      ),
    ).toEqual({
      city: "Cape Town",
      suburb: "Gardens",
      local_area: "Gardens",
    });
  });
});
