import { describe, it, expect } from "vitest";
import {
  applyLocationScopeToStaffIds,
  decideStaffLocationScope,
  decideUnassignedStaffBranchAccess,
  isStaffInLocationScope,
} from "../staff-location-scope";

describe("decideStaffLocationScope", () => {
  it("does not filter when no location is selected", () => {
    expect(
      decideStaffLocationScope({
        locationId: null,
        locationBelongsToProvider: true,
        activeLocationCount: 3,
        providerJunctionCount: 4,
        assignedStaffIds: [],
      }),
    ).toEqual({ staffIds: null, mode: "all" });
  });

  it("returns empty roster when the location is not this provider's", () => {
    expect(
      decideStaffLocationScope({
        locationId: "loc-x",
        locationBelongsToProvider: false,
        activeLocationCount: 2,
        providerJunctionCount: 2,
        assignedStaffIds: ["s1"],
      }),
    ).toEqual({ staffIds: [], mode: "strict" });
  });

  it("keeps all staff for a single-location or pre-junction tenant", () => {
    expect(
      decideStaffLocationScope({
        locationId: "loc-1",
        locationBelongsToProvider: true,
        activeLocationCount: 1,
        providerJunctionCount: 0,
        assignedStaffIds: [],
      }),
    ).toEqual({ staffIds: null, mode: "all" });
  });

  it("hides everyone on a branch with no assignments once the salon uses locations", () => {
    expect(
      decideStaffLocationScope({
        locationId: "loc-b",
        locationBelongsToProvider: true,
        activeLocationCount: 2,
        providerJunctionCount: 3,
        assignedStaffIds: [],
      }),
    ).toEqual({ staffIds: [], mode: "strict" });
  });

  it("includes unassigned staff on every branch as the default", () => {
    expect(
      decideStaffLocationScope({
        locationId: "loc-b",
        locationBelongsToProvider: true,
        activeLocationCount: 2,
        providerJunctionCount: 3,
        assignedStaffIds: ["s1"],
        unassignedStaffIds: ["s-open"],
      }),
    ).toEqual({ staffIds: ["s1", "s-open"], mode: "strict" });
  });

  it("returns only staff assigned to that branch", () => {
    expect(
      decideStaffLocationScope({
        locationId: "loc-a",
        locationBelongsToProvider: true,
        activeLocationCount: 2,
        providerJunctionCount: 3,
        assignedStaffIds: ["s1", "s2"],
      }),
    ).toEqual({ staffIds: ["s1", "s2"], mode: "strict" });
  });
});

describe("decideUnassignedStaffBranchAccess", () => {
  it("allows assigned staff on their branch and denies others", () => {
    expect(
      decideUnassignedStaffBranchAccess({
        assignedLocationIds: ["loc-a"],
        bookingLocationId: "loc-a",
        activeLocationCount: 2,
        providerJunctionCount: 3,
      }),
    ).toEqual({ allowed: true });
    expect(
      decideUnassignedStaffBranchAccess({
        assignedLocationIds: ["loc-a"],
        bookingLocationId: "loc-b",
        activeLocationCount: 2,
        providerJunctionCount: 3,
      }).allowed,
    ).toBe(false);
  });

  it("treats staff with no location rows as available at every branch", () => {
    expect(
      decideUnassignedStaffBranchAccess({
        assignedLocationIds: [],
        bookingLocationId: "loc-b",
        activeLocationCount: 2,
        providerJunctionCount: 3,
      }),
    ).toEqual({ allowed: true });
  });

  it("intersects staff ids with a strict scope and leaves legacy unfiltered", () => {
    expect(
      applyLocationScopeToStaffIds(["s1", "s2", "s3"], { staffIds: ["s2"], mode: "strict" }),
    ).toEqual(["s2"]);
    expect(
      applyLocationScopeToStaffIds(["s1", "s2"], { staffIds: null, mode: "all" }),
    ).toEqual(["s1", "s2"]);
    expect(isStaffInLocationScope("s1", { staffIds: null, mode: "all" })).toBe(true);
    expect(isStaffInLocationScope("s1", { staffIds: ["s2"], mode: "strict" })).toBe(false);
  });

  it("allows unassigned staff on legacy or single-location tenants", () => {
    expect(
      decideUnassignedStaffBranchAccess({
        assignedLocationIds: [],
        bookingLocationId: "loc-1",
        activeLocationCount: 1,
        providerJunctionCount: 0,
      }),
    ).toEqual({ allowed: true });
  });
});
