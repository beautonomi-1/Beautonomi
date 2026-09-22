import { describe, expect, it } from "vitest";
import { collectGroupBookingCreateValidationErrors } from "./collect-group-booking-create-errors";
import {
  validateGroupBookingCreateStep,
  validateGroupBookingCreateStepDetailed,
} from "./validateGroupBookingCreate";

const validatePhone = (phone: string) => (phone.startsWith("+") ? null : "Phone must be E.164");

describe("validateGroupBookingCreateStep", () => {
  const base = {
    date: "2026-06-01",
    time: "10:00",
    duration: "60",
    serviceId: "svc-1",
    staffId: "staff-1",
    locationType: "at_salon" as const,
    addressLine1: "",
    addressLatitude: null,
    addressLongitude: null,
    participants: [{ name: "Alex", phone: "+27123456789", email: "", serviceId: "svc-1" }],
    validatePhone,
  };

  it("requires service id", () => {
    expect(validateGroupBookingCreateStep({ ...base, serviceId: "" })).toMatch(/service/i);
  });

  it("accepts valid salon group create input", () => {
    expect(validateGroupBookingCreateStep(base)).toBeNull();
  });
});

describe("collectGroupBookingCreateValidationErrors", () => {
  const base = {
    date: "2026-06-01",
    time: "10:00",
    duration: "60",
    serviceId: "",
    staffId: "",
    locationType: "at_salon" as const,
    addressLine1: "",
    addressLatitude: null,
    addressLongitude: null,
    participants: [{ name: "Alex", phone: "+27123456789", email: "", serviceId: "svc-1" }],
    validatePhone,
  };

  it("returns multiple errors", () => {
    const errs = collectGroupBookingCreateValidationErrors(base);
    expect(errs.length).toBeGreaterThan(1);
    expect(errs.some((e) => e.field === "serviceId")).toBe(true);
    expect(errs.some((e) => e.field === "staffId")).toBe(true);
  });
});

describe("validateGroupBookingCreateStepDetailed", () => {
  const base = {
    date: "2026-06-01",
    time: "10:00",
    duration: "60",
    serviceId: "svc-1",
    staffId: "staff-1",
    locationType: "at_salon" as const,
    addressLine1: "",
    addressLatitude: null,
    addressLongitude: null,
    participants: [{ name: "Alex", phone: "+27123456789", email: "", serviceId: "svc-1" }],
    validatePhone,
  };

  it("maps missing service to serviceId field", () => {
    expect(validateGroupBookingCreateStepDetailed({ ...base, serviceId: "" })).toEqual({
      field: "serviceId",
      message: expect.stringMatching(/service/i),
    });
  });
});
