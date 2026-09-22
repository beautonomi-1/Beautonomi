import { describe, expect, it } from "vitest";
import { validateCreateBooking } from "./validate-create-booking";

describe("validateCreateBooking", () => {
  const base = {
    clientName: "Jane",
    staffId: "staff-1",
    date: "2026-07-29",
    startTime: "10:00",
    serviceCount: 1,
    intakeValid: true,
    appointmentKind: "in_salon" as const,
    atHomeAddressReady: true,
  };

  it("passes when required fields are present", () => {
    expect(validateCreateBooking(base)).toBeNull();
  });

  it("blocks at-home without address", () => {
    expect(
      validateCreateBooking({
        ...base,
        appointmentKind: "at_home",
        atHomeAddressReady: false,
      }),
    ).toMatch(/address/i);
  });

  it("blocks when intake forms incomplete", () => {
    expect(validateCreateBooking({ ...base, intakeValid: false })).toMatch(/intake/i);
  });

  it("blocks when no services selected", () => {
    expect(validateCreateBooking({ ...base, serviceCount: 0 })).toMatch(/service/i);
  });

  it("allows products-only when productCount > 0", () => {
    expect(
      validateCreateBooking({
        ...base,
        serviceCount: 0,
        productCount: 1,
        staffListLength: 0,
        staffId: "",
      }),
    ).toBeNull();
  });

  it("skips staff when staffListLength is 0", () => {
    expect(
      validateCreateBooking({
        ...base,
        staffId: "",
        staffListLength: 0,
      }),
    ).toBeNull();
  });
});
