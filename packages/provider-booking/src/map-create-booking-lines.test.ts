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

  it("does not add custom flags for catalog lines", () => {
    const catalogId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const rows = mapCreateBookingServiceLines(
      [{ id: "l", serviceId: catalogId, serviceName: "Haircut", price: 100, duration: 45 }],
      "fallback",
    );
    expect(rows[0]).toMatchObject({
      service_id: catalogId,
      serviceName: "Haircut",
    });
    expect(rows[0]).not.toHaveProperty("isCustom");
    expect(rows[0]).not.toHaveProperty("name");
  });

  it("adds custom flags for custom- placeholder id", () => {
    const rows = mapCreateBookingServiceLines(
      [
        {
          id: "l",
          serviceId: "custom-1",
          serviceName: "Bridal",
          price: 500,
          duration: 120,
        },
      ],
      "fallback",
    );
    expect(rows[0]).toMatchObject({
      isCustom: true,
      customName: "Bridal",
      name: "Bridal",
    });
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
