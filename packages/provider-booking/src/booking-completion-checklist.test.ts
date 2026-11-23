import { describe, expect, it } from "vitest";
import { buildBookingCompletionChecklist } from "./booking-completion-checklist";

const base = {
  status: "confirmed",
  paymentStatus: "paid",
  outstanding: 0,
  unpaidAdditionalCharges: 0,
  productOrders: [] as Array<{ status?: string | null }>,
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
  });

  it("keeps products open while the appointment order is only confirmed", () => {
    const result = buildBookingCompletionChecklist({
      ...base,
      outstanding: 165,
      paymentStatus: "partially_paid",
      hasProductsOnBooking: true,
      productOrders: [{ status: "confirmed", fulfillment_type: "collection" }],
    });
    expect(result.items.find((item) => item.id === "payment")?.done).toBe(false);
    expect(result.items.find((item) => item.id === "payment")?.detail).toBe("Balance still due");
    expect(result.items.find((item) => item.id === "products")?.done).toBe(false);
    expect(result.items.find((item) => item.id === "products")?.detail).toBe("Not marked collected");
    expect(result.blockingLabels).toContain("Outstanding balance");
  });

  it("marks products done once the order is delivered and nothing is outstanding", () => {
    const result = buildBookingCompletionChecklist({
      ...base,
      hasProductsOnBooking: true,
      productOrders: [{ status: "delivered" }],
    });
    expect(result.items.every((item) => item.done)).toBe(true);
  });
});
