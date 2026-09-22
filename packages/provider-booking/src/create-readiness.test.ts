import { describe, expect, it } from "vitest";
import { buildGroupBookingCreateReadiness, buildSingleBookingCreateReadiness } from "./create-readiness";

const validatePhone = (phone: string) => (phone.startsWith("+") ? null : "Phone must be E.164");

describe("buildGroupBookingCreateReadiness", () => {
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

  it("is 100% when input is valid", () => {
    const s = buildGroupBookingCreateReadiness(base);
    expect(s.percent).toBe(100);
    expect(s.completed).toBe(s.total);
    expect(s.nextItem).toBeUndefined();
  });

  it("counts missing service and staff", () => {
    const s = buildGroupBookingCreateReadiness({ ...base, serviceId: "", staffId: "" });
    expect(s.percent).toBeLessThan(100);
    expect(s.nextItem?.sectionKey).toBeDefined();
    const ids = s.items.filter((i) => !i.done).map((i) => i.id);
    expect(ids).toContain("group_service");
    expect(ids).toContain("group_staff");
  });
});

describe("buildSingleBookingCreateReadiness", () => {
  const base = {
    clientMode: "search" as const,
    hasSelectedClient: true,
    newClientFirstName: "",
    isWalkIn: false,
    validatePhone,
    newClientPhone: "",
    serviceCount: 1,
    productCount: 0,
    hasDate: true,
    hasTime: true,
    isRecurring: false,
    recurringHasSavedClient: true,
    recurringOccurrences: "",
    staffListLength: 1,
    allServicesHaveStaff: true,
    intakeForms: [],
    intakeResponses: {},
    locationType: "at_salon" as const,
    addressLine1: "",
    addressLatitude: null,
    addressLongitude: null,
  };

  it("is complete for minimal valid salon booking", () => {
    const s = buildSingleBookingCreateReadiness(base);
    expect(s.percent).toBe(100);
  });

  it("allows products-only", () => {
    const s = buildSingleBookingCreateReadiness({
      ...base,
      serviceCount: 0,
      productCount: 2,
      staffListLength: 0,
    });
    expect(s.percent).toBe(100);
  });
});
