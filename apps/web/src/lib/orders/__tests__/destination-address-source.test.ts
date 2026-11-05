import { describe, expect, it } from "vitest";
import { destinationAddressSource } from "../shipping";

describe("destinationAddressSource", () => {
  const snapshot = {
    address_line1: "12 Main",
    city: "Cape Town",
    postal_code: "8001",
    country: "ZA",
  };

  it("uses the snapshot when the user embed is null", () => {
    expect(destinationAddressSource(null, snapshot)).toEqual(snapshot);
  });

  it("uses the snapshot when the embed has no street line", () => {
    expect(destinationAddressSource({ city: "Johannesburg" }, snapshot)).toEqual(snapshot);
  });

  it("keeps a complete embedded address", () => {
    const embedded = { address_line1: "9 Loop", city: "Cape Town", postal_code: "8001" };
    expect(destinationAddressSource(embedded, snapshot)).toEqual(embedded);
  });
});