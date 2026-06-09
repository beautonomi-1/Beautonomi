import {
  buildBookingEditPatchPayload,
  computeBookingEditLineSubtotal,
  mapBookingDetailToEditLines,
} from "@/lib/build-booking-edit-patch-payload";

describe("build-booking-edit-patch-payload", () => {
  const catalog = [
    {
      id: "svc-1",
      title: "Cut",
      duration_minutes: 60,
      price: 200,
      currency: "ZAR",
    },
  ];

  it("maps booking detail lines", () => {
    const mapped = mapBookingDetailToEditLines({
      services: [{ offering_id: "svc-1", staff_id: "staff-1" }],
      products: [{ product_id: "prod-1", product_name: "Shampoo", quantity: 2, unit_price: 50 }],
    });
    expect(mapped.services).toEqual([{ serviceId: "svc-1", staffId: "staff-1", addOnIds: [] }]);
    expect(mapped.products[0]?.quantity).toBe(2);
  });

  it("computes subtotal from catalogue prices", () => {
    const result = computeBookingEditLineSubtotal(
      [{ serviceId: "svc-1", addOnIds: [] }],
      [{ productId: "prod-1", productName: "Shampoo", quantity: 1, unitPrice: 50 }],
      catalog,
    );
    expect(result.subtotal).toBe(250);
    expect(result.totalMinutes).toBe(60);
  });

  it("builds PATCH payload with per-service staff and version", () => {
    const payload = buildBookingEditPatchPayload({
      selectedServices: [{ serviceId: "svc-1", staffId: "staff-9", addOnIds: [] }],
      selectedProducts: [],
      catalogServices: catalog,
      scheduledAt: "2026-06-10T09:00:00.000Z",
      notes: "Updated",
      manualDiscount: 20,
      preservedDiscountTotal: 10,
      taxRate: 0.15,
      taxInclusive: true,
      travelFee: 0,
      tipAmount: 0,
      serviceFeeAmount: 0,
      version: 3,
    });

    expect(payload.services[0]?.staff_id).toBe("staff-9");
    expect(payload.staff_id).toBe("staff-9");
    expect(payload.special_requests).toBe("Updated");
    expect(payload.version).toBe(3);
    expect(payload.discount_amount).toBe(20);
    expect(payload.total_amount).toBeGreaterThan(0);
  });
});
