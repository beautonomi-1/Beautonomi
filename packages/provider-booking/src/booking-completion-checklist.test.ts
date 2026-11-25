import { describe, expect, it } from "vitest";
import { buildBookingCompletionChecklist } from "./booking-completion-checklist";

const base = {
  status: "confirmed",
  paymentStatus: "paid",
  outstanding: 0,
  unpaidAdditionalCharges: 0,
  productOrders: [] as Array<{ id?: string; status?: string | null; fulfillment_type?: string | null }>,
  hasProductsOnBooking: false,
};

describe("buildBookingCompletionChecklist", () => {
  it("does not treat a saved product as handed over when no order is loaded", () => {
    const result = buildBookingCompletionChecklist({
      ...base,
      hasProductsOnBooking: true,
      productOrders: [],
    });
    const products = result.items.find((item) => item.id === "products");
    expect(products?.done).toBe(false);
    expect(result.allDone).toBe(false);
    expect(result.blockers.some((b) => b.code === "products_unprepared")).toBe(true);
  });

  it("keeps products open while the appointment order is only confirmed", () => {
    const result = buildBookingCompletionChecklist({
      ...base,
      outstanding: 165,
      paymentStatus: "partially_paid",
      hasProductsOnBooking: true,
      productOrders: [{ id: "ord-1", status: "confirmed", fulfillment_type: "collection" }],
    });
    expect(result.items.find((item) => item.id === "payment")?.done).toBe(false);
    expect(result.items.find((item) => item.id === "products")?.done).toBe(false);
    expect(result.items.find((item) => item.id === "products")?.detail).toBe("Not marked collected");
    expect(result.blockers).toContainEqual({
      code: "outstanding",
      label: "Outstanding balance",
    });
    expect(result.blockers).toContainEqual({
      code: "products_collection",
      orderId: "ord-1",
      label: "Products not marked collected",
    });
  });

  it("marks products done once the order is delivered and nothing is outstanding", () => {
    const result = buildBookingCompletionChecklist({
      ...base,
      hasProductsOnBooking: true,
      productOrders: [{ status: "delivered" }],
    });
    expect(result.items.every((item) => item.done)).toBe(true);
    expect(result.blockers.length).toBe(0);
  });

  it("treats missing fulfillment type as unspecified, not collection", () => {
    const result = buildBookingCompletionChecklist({
      ...base,
      hasProductsOnBooking: true,
      productOrders: [{ id: "ord-2", status: "confirmed", fulfillment_type: null }],
    });
    expect(result.items.find((item) => item.id === "products")?.detail).toBe("Choose pickup or delivery");
    expect(result.blockers).toContainEqual({
      code: "products_unspecified",
      orderId: "ord-2",
      label: "Choose pickup or delivery for product order",
    });
  });
});