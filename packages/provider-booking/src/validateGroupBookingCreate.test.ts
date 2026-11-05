import { describe, expect, it } from "vitest";
import { ANY_STAFF_ID } from "./staff-assignment";
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

  it("returns service and staff errors when both missing", () => {
    const errs = collectGroupBookingCreateValidationErrors({
      ...base,
      serviceId: "svc-1",
      staffId: "",
      staffListLength: 3,
    });
    expect(errs.some((e) => e.field === "staffId")).toBe(true);
  });

  it("returns service error when service missing", () => {
    const errs = collectGroupBookingCreateValidationErrors({
      ...base,
      staffListLength: 3,
    });
    expect(errs.some((e) => e.field === "serviceId")).toBe(true);
    expect(errs.some((e) => e.field === "staffId")).toBe(false);
  });

  it("accepts any staff when team has members", () => {
    const errs = collectGroupBookingCreateValidationErrors({
      ...base,
      serviceId: "svc-1",
      staffId: ANY_STAFF_ID,
      staffListLength: 3,
    });
    expect(errs.some((e) => e.field === "staffId")).toBe(false);
  });

  it("does not require staff when roster loaded empty", () => {
    const errs = collectGroupBookingCreateValidationErrors({
      ...base,
      serviceId: "svc-1",
      staffId: "",
      staffListLength: 0,
      staffRosterUnresolved: false,
    });
    expect(errs.some((e) => e.field === "staffId")).toBe(false);
  });

  it("requires staff while roster unresolved", () => {
    const errs = collectGroupBookingCreateValidationErrors({
      ...base,
      serviceId: "svc-1",
      staffId: "",
      staffListLength: 0,
      staffRosterUnresolved: true,
    });
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
