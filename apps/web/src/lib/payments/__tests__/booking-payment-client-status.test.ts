import { describe, expect, it } from "vitest";
import { bookingIdForClientStatus, statusFromRecordedRow } from "../booking-payment-client-status";

describe("statusFromRecordedRow", () => {
  it("confirms an ad or subscription only after the order is paid", () => {
    expect(statusFromRecordedRow("ads", { status: "pending" })).toBe("pending");
    expect(statusFromRecordedRow("ads", { status: "paid" })).toBe("success");
    expect(statusFromRecordedRow("subscription", { status: "failed" })).toBe("pending");
    expect(statusFromRecordedRow("subscription", { status: "paid" })).toBe("success");
    expect(statusFromRecordedRow("membership", { status: "failed" })).toBe("pending");
    expect(statusFromRecordedRow("membership", { status: "paid" })).toBe("success");
  });

  it("confirms a product order from its payment status", () => {
    expect(statusFromRecordedRow("product_order", { payment_status: "pending" })).toBe("pending");
    expect(statusFromRecordedRow("product_order", { payment_status: "paid" })).toBe("success");
    expect(statusFromRecordedRow("product_order", { payment_status: "partially_paid" })).toBe("success");
  });

  it("confirms a group guest share from the participant, not the organizer booking", () => {
    expect(
      statusFromRecordedRow("guest_share", {
        participant_payment_status: "pending",
        amount_due: 50,
        amount_paid: 0,
      }),
    ).toBe("pending");
    expect(
      statusFromRecordedRow("guest_share", {
        participant_payment_status: "paid",
        amount_due: 50,
        amount_paid: 50,
      }),
    ).toBe("success");
  });

  it("confirms gift cards, invoices, terminal orders, and custom offers from their saved rows", () => {
    expect(statusFromRecordedRow("gift_card", { status: "pending" })).toBe("pending");
    expect(statusFromRecordedRow("gift_card", { status: "paid" })).toBe("success");
    expect(statusFromRecordedRow("invoice", { status: "open" })).toBe("pending");
    expect(statusFromRecordedRow("invoice", { status: "paid" })).toBe("success");
    expect(statusFromRecordedRow("terminal", { invoice_status: "pending" })).toBe("pending");
    expect(statusFromRecordedRow("terminal", { invoice_status: "paid" })).toBe("success");
    expect(statusFromRecordedRow("custom_offer", { status: "paid", booking_id: null })).toBe("pending");
    expect(statusFromRecordedRow("custom_offer", { status: "payment_pending", booking_id: "booking-1" })).toBe("pending");
    expect(statusFromRecordedRow("custom_offer", { status: "finalize_failed", booking_id: "booking-1" })).toBe("pending");
    expect(statusFromRecordedRow("custom_offer", { status: "paid", booking_id: "booking-1" })).toBe("success");
    expect(statusFromRecordedRow("custom_offer", { status: "accepted", booking_id: "booking-1" })).toBe("success");
    expect(bookingIdForClientStatus({ custom_offer_id: "offer-1" }, "pending", "booking-1")).toBeNull();
    expect(bookingIdForClientStatus({ custom_offer_id: "offer-1" }, "success", "booking-1")).toBe("booking-1");
    expect(bookingIdForClientStatus({ booking_id: "booking-1" }, "pending", "booking-1")).toBe("booking-1");
  });

  it("treats a missing row as not yet recorded", () => {
    expect(statusFromRecordedRow("booking", null)).toBe("pending");
    expect(statusFromRecordedRow("booking", { payment_status: "paid" })).toBe("success");
  });
});
