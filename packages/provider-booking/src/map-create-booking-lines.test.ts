import { describe, expect, it } from "vitest";
import {
  mapCreateBookingProductLines,
  mapCreateBookingServiceLines,
  resolveDepositChargeAmount,
} from "./map-create-booking-lines";

describe("mapCreateBookingServiceLines", () => {
  it("maps addons to add_on_ids and rolls up duration and price", () => {
    const rows = mapCreateBookingServiceLines(
      [
        {
          id: "line-1",
          serviceId: "svc-1",
          serviceName: "Cut",
          price: 200,
          duration: 45,
          staffId: "staff-a",
          addons: [
            { addonId: "ao-1", addonName: "Treatment", price: 50, duration: 15 },
          ],
        },
      ],
      "staff-fallback",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      service_id: "svc-1",
      price: 250,
      duration_minutes: 60,
      staff_id: "staff-a",
      add_on_ids: ["ao-1"],
    });
  });

  it("uses fallback staff when line has no staffId", () => {
    const rows = mapCreateBookingServiceLines(
      [{ id: "l", serviceId: "s", serviceName: "S", price: 1, duration: 30 }],
      "fallback",
    );
    expect(rows[0]?.staff_id).toBe("fallback");
  });
});

describe("mapCreateBookingProductLines", () => {
  it("maps variant id and display name", () => {
    const rows = mapCreateBookingProductLines([
      {
        id: "p1",
        productId: "prod-1",
        productName: "Shampoo",
        productVariantId: "var-1",
        productVariantName: "500ml",
        quantity: 2,
        unitPrice: 80,
        totalPrice: 160,
      },
    ]);

    expect(rows[0]).toMatchObject({
      product_variant_id: "var-1",
      product_name: "Shampoo (500ml)",
      total_price: 160,
    });
  });
});

describe("resolveDepositChargeAmount", () => {
  it("ceil-deposits percentage of total", () => {
    expect(resolveDepositChargeAmount(199, true, 50)).toBe(100);
    expect(resolveDepositChargeAmount(199, false, 50)).toBe(199);
  });
});
