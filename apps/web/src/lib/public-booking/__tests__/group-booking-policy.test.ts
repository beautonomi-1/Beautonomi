import { describe, expect, it } from "vitest";
import { evaluateGroupBookingPolicy } from "../group-booking-policy";

describe("evaluateGroupBookingPolicy", () => {
  const base = () => ({
    additionalGuestCount: 2,
    onlineGroupBookingEnabled: true,
    maxGroupSize: 6,
    excludedServiceIds: [] as string[],
    primaryOfferingIds: ["a"],
    participantOfferingIds: ["b", "b"],
    locationType: "at_salon" as const,
    locationId: "loc-1",
    enabledLocationIds: null as string[] | null,
  });

  it("rejects when online group booking disabled", () => {
    const r = evaluateGroupBookingPolicy({ ...base(), onlineGroupBookingEnabled: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("GROUP_BOOKING_DISABLED");
  });

  it("rejects when no additional guests", () => {
    const r = evaluateGroupBookingPolicy({ ...base(), additionalGuestCount: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("GROUP_PARTICIPANTS_REQUIRED");
  });

  it("rejects when head count exceeds max", () => {
    const r = evaluateGroupBookingPolicy({ ...base(), additionalGuestCount: 10, maxGroupSize: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("GROUP_SIZE_EXCEEDED");
  });

  it("rejects excluded primary service", () => {
    const r = evaluateGroupBookingPolicy({
      ...base(),
      primaryOfferingIds: ["x"],
      excludedServiceIds: ["x"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("GROUP_SERVICE_EXCLUDED");
  });

  it("rejects excluded participant service", () => {
    const r = evaluateGroupBookingPolicy({
      ...base(),
      participantOfferingIds: ["y"],
      excludedServiceIds: ["y"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("GROUP_SERVICE_EXCLUDED");
  });

  it("rejects salon location not in enabled list when list is non-empty", () => {
    const r = evaluateGroupBookingPolicy({
      ...base(),
      enabledLocationIds: ["other-loc"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("GROUP_LOCATION_NOT_ALLOWED");
  });

  it("allows when enabled list includes location", () => {
    const r = evaluateGroupBookingPolicy({
      ...base(),
      enabledLocationIds: ["loc-1", "loc-2"],
    });
    expect(r).toEqual({ ok: true });
  });

  it("allows any salon location when enabled list empty", () => {
    const r = evaluateGroupBookingPolicy({
      ...base(),
      enabledLocationIds: [],
    });
    expect(r).toEqual({ ok: true });
  });
});
