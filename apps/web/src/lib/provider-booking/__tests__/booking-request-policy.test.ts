import { describe, expect, it } from "vitest";
import {
  providerBookingHasServiceInput,
  shouldRejectProductOnlyProviderBooking,
} from "../booking-request-policy";

describe("provider booking request policy", () => {
  it("rejects product-only provider booking payloads so sales use the sales path", () => {
    expect(
      shouldRejectProductOnlyProviderBooking({
        products: [{ product_id: "product-1", quantity: 1 }],
      }),
    ).toBe(true);
  });

  it("allows appointment bookings with services and products", () => {
    expect(
      shouldRejectProductOnlyProviderBooking({
        services: [{ offering_id: "offering-1" }],
        products: [{ product_id: "product-1", quantity: 1 }],
      }),
    ).toBe(false);
  });

  it("recognizes legacy single-service fields", () => {
    expect(providerBookingHasServiceInput({ service_id: "offering-1" })).toBe(true);
    expect(providerBookingHasServiceInput({ offering_id: "offering-1" })).toBe(true);
  });
});
