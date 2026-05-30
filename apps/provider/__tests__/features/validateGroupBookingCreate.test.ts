import {
  validateGroupBookingCreateStep,
  validateGroupBookingCreateStepDetailed,
} from "@/features/group-bookings/validateGroupBookingCreate";

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

  it("requires staff id", () => {
    expect(validateGroupBookingCreateStep({ ...base, staffId: "" })).toMatch(/team member/i);
  });

  it("requires at-home address and coordinates", () => {
    expect(
      validateGroupBookingCreateStep({
        ...base,
        locationType: "at_home",
        addressLine1: "",
        addressLatitude: null,
        addressLongitude: null,
      }),
    ).toMatch(/address/i);
    expect(
      validateGroupBookingCreateStep({
        ...base,
        locationType: "at_home",
        addressLine1: "12 Main Rd",
        addressLatitude: null,
        addressLongitude: null,
      }),
    ).toMatch(/coordinates/i);
  });

  it("requires participant with valid phone and service", () => {
    expect(
      validateGroupBookingCreateStep({
        ...base,
        participants: [{ name: "Alex", phone: "bad", email: "", serviceId: "svc-1" }],
      }),
    ).toMatch(/Participant 1/i);
    expect(
      validateGroupBookingCreateStep({
        ...base,
        participants: [{ name: "Alex", phone: "+27123456789", email: "", serviceId: "" }],
      }),
    ).toMatch(/participant 1/i);
  });

  it("accepts valid salon group create input", () => {
    expect(validateGroupBookingCreateStep(base)).toBeNull();
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

  it("maps missing staff to staffId field", () => {
    expect(validateGroupBookingCreateStepDetailed({ ...base, staffId: "" })).toEqual({
      field: "staffId",
      message: expect.stringMatching(/team member/i),
    });
  });

  it("maps at-home address issues to address field", () => {
    expect(
      validateGroupBookingCreateStepDetailed({
        ...base,
        locationType: "at_home",
        addressLine1: "",
      }),
    ).toEqual({
      field: "address",
      message: expect.stringMatching(/address/i),
    });
  });

  it("maps participant service gap to participant index field", () => {
    expect(
      validateGroupBookingCreateStepDetailed({
        ...base,
        participants: [{ name: "Alex", phone: "+27123456789", email: "", serviceId: "" }],
      }),
    ).toEqual({
      field: "participant:0",
      message: expect.stringMatching(/participant 1/i),
    });
  });
});
