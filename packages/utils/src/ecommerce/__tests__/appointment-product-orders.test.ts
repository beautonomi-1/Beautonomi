import { describe, expect, it } from "vitest";
import {
  countOpenAppointmentProductOrders,
  isCollectionFulfillment,
  isOpenProductOrderStatus,
} from "../appointment-product-orders";
import { isBookingResourceLocked } from "../../booking/resource-lock";

describe("appointment product orders", () => {
  it("treats blank fulfillment as not collection", () => {
    expect(isCollectionFulfillment(null)).toBe(false);
    expect(isCollectionFulfillment("")).toBe(false);
    expect(isCollectionFulfillment("collection")).toBe(true);
    expect(isCollectionFulfillment("pickup")).toBe(true);
  });

  it("counts open orders", () => {
    expect(
      countOpenAppointmentProductOrders([
        { status: "delivered" },
        { status: "confirmed" },
        { status: "cancelled" },
      ]),
    ).toBe(1);
    expect(isOpenProductOrderStatus("processing")).toBe(true);
  });
});

describe("isBookingResourceLocked", () => {
  it("locks completed, cancelled, and no_show", () => {
    expect(isBookingResourceLocked("completed")).toBe(true);
    expect(isBookingResourceLocked("no_show")).toBe(true);
    expect(isBookingResourceLocked("cancelled")).toBe(true);
    expect(isBookingResourceLocked("confirmed")).toBe(false);
  });
});