import { describe, expect, it } from "vitest";
import {
  groupPackageTotal,
  groupParticipantServiceRows,
  groupProductLineTotal,
  normalizeGroupProductRows,
} from "../group-booking-package-pricing";

describe("group booking package pricing helpers", () => {
  it("applies a package discount once to the group participant service subtotal", () => {
    expect(
      groupPackageTotal({
        participantTotal: 1_000,
        productTotal: 200,
        travelFee: 50,
        packageDiscount: 250,
      }),
    ).toBe(1_000);
  });

  it("never lets package discount reduce products or travel", () => {
    expect(
      groupPackageTotal({
        participantTotal: 100,
        productTotal: 200,
        travelFee: 50,
        packageDiscount: 500,
      }),
    ).toBe(250);
  });

  it("normalizes participant services with a group-level fallback service", () => {
    expect(
      groupParticipantServiceRows([{ service_id: "svc-a" }, { name: "guest" }], "svc-default"),
    ).toEqual([{ offering_id: "svc-a" }, { offering_id: "svc-default" }]);
  });

  it("normalizes product rows with variant IDs", () => {
    expect(
      normalizeGroupProductRows([
        { productId: "prod-a", productVariantId: "var-a", quantity: "2" },
        { product_id: "", quantity: 1 },
      ]),
    ).toEqual([{ product_id: "prod-a", product_variant_id: "var-a", quantity: 2 }]);
  });

  it("computes product line totals from explicit or derived totals", () => {
    expect(groupProductLineTotal({ total_price: 123 })).toBe(123);
    expect(groupProductLineTotal({ unitPrice: 20, quantity: 3 })).toBe(60);
  });
});
