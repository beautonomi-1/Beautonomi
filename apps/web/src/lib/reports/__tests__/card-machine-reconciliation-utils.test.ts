import { describe, expect, it } from "vitest";
import {
  isPaycloudPaymentException,
  isYocoPaymentException,
  paycloudPaymentMatchesLocation,
  yocoPaymentMatchesLocation,
} from "../card-machine-reconciliation-utils";

describe("card-machine-reconciliation-utils", () => {
  it("treats Yoco pending as exception", () => {
    expect(isYocoPaymentException("pending")).toBe(true);
    expect(isYocoPaymentException("successful")).toBe(false);
  });

  it("treats PayCloud non-exact non-pending as exception", () => {
    expect(isPaycloudPaymentException("mismatch")).toBe(true);
    expect(isPaycloudPaymentException("exact")).toBe(false);
    expect(isPaycloudPaymentException("pending")).toBe(false);
  });

  it("location filter drops unlinked Yoco rows", () => {
    const loc = "loc-1";
    const bookings = new Set(["b1"]);
    const sales = new Set<string>();
    expect(
      yocoPaymentMatchesLocation({ id: "1", appointment_id: "b1" }, loc, bookings, sales),
    ).toBe(true);
    expect(
      yocoPaymentMatchesLocation({ id: "2", appointment_id: "other" }, loc, bookings, sales),
    ).toBe(false);
    expect(yocoPaymentMatchesLocation({ id: "3" }, loc, bookings, sales)).toBe(false);
  });

  it("PayCloud matches via group booking id", () => {
    const loc = "loc-1";
    const groups = new Set(["g1"]);
    expect(
      paycloudPaymentMatchesLocation(
        { id: "1", group_booking_id: "g1" },
        loc,
        new Set(),
        new Set(),
        groups,
        new Set(),
      ),
    ).toBe(true);
  });
});
