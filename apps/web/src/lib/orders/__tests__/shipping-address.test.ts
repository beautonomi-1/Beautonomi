import { describe, expect, it } from "vitest";
import { toShippingAddress } from "../shipping";

describe("toShippingAddress", () => {
  it("reads address_line1 from user_addresses / provider_locations", () => {
    expect(
      toShippingAddress(
        {
          label: "Home",
          address_line1: "12 Long Street",
          address_line2: "Gardens",
          city: "Cape Town",
          state: "Western Cape",
          postal_code: "8001",
          country: "ZA",
        },
        "Customer",
        { phone: "0820000000", email: "a@b.c" },
      ),
    ).toEqual({
      name: "Home",
      line1: "12 Long Street",
      line2: "Gardens",
      city: "Cape Town",
      region: "Western Cape",
      postalCode: "8001",
      country: "ZA",
      phone: "0820000000",
      email: "a@b.c",
    });
  });

  it("unwraps a nested supabase join array", () => {
    const address = toShippingAddress(
      [{ address_line1: "1 Main", city: "Durban", postal_code: "4001", country: "ZA" }],
      "Store",
    );
    expect(address?.line1).toBe("1 Main");
    expect(address?.name).toBe("Store");
  });

  it("returns null when the street line is missing", () => {
    expect(
      toShippingAddress({ city: "Cape Town", postal_code: "8001", country: "ZA" }, "Customer"),
    ).toBeNull();
  });
});
