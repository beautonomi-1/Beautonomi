import { describe, expect, it } from "vitest";
import {
  interpretBookShipmentResponse,
  providerShippingBookingDisplay,
} from "@/lib/orders/provider-shipping-ui";

describe("providerShippingBookingDisplay", () => {
  it("hides book courier while Bob Go is submitting but shows tracking ref context via print gate", () => {
    const ui = providerShippingBookingDisplay({
      fulfillment_type: "delivery",
      payment_status: "paid",
      status: "processing",
      tracking_number: "BG-123",
      carrier: "bob-go",
      shipping_booking_status: "submitting",
    });
    expect(ui?.showBookCourier).toBe(false);
    expect(ui?.showPrintWaybill).toBe(false);
    expect(ui?.statusLabel).toBe("Waiting for Bob Go");
  });

  it("allows book courier when rates are still pending and no tracking number", () => {
    const ui = providerShippingBookingDisplay({
      fulfillment_type: "delivery",
      payment_status: "paid",
      status: "processing",
      tracking_number: null,
      shipping_booking_status: "skipped",
      shipping_booking_detail: "rates_pending",
    });
    expect(ui?.showBookCourier).toBe(true);
    expect(ui?.statusLabel).toBe("Couriers still quoting");
  });
});

describe("interpretBookShipmentResponse", () => {
  it("surfaces already_booked as info, not success toast copy", () => {
    const r = interpretBookShipmentResponse({ result: { ok: true, skipped: "already_booked" } });
    expect(r.variant).toBe("info");
    expect(r.message).toMatch(/already/i);
  });

  it("reads nested successResponse shape", () => {
    const r = interpretBookShipmentResponse({
      data: { result: { ok: false, error: "bob_go_domestic_only" } },
    });
    expect(r.variant).toBe("error");
    expect(r.message).toBe("bob_go_domestic_only");
  });
});
