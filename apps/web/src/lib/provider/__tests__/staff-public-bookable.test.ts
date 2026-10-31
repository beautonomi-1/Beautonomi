import { describe, expect, it } from "vitest";
import {
  filterStaffForServiceColumns,
  isExplicitServiceProvider,
  isPubliclyBookableStaff,
} from "../staff-public-bookable";

describe("isPubliclyBookableStaff", () => {
  it("treats null flags as bookable", () => {
    expect(isPubliclyBookableStaff({ is_active: true })).toBe(true);
  });

  it("drops enable_in_online_booking false", () => {
    expect(
      isPubliclyBookableStaff({
        is_active: true,
        is_service_provider: true,
        enable_in_online_booking: false,
      }),
    ).toBe(false);
  });

  it("drops future bookable_from in provider timezone", () => {
    expect(
      isPubliclyBookableStaff(
        {
          is_active: true,
          bookable_from: "2099-01-01",
        },
        "Africa/Johannesburg",
        new Date("2026-01-15T12:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("filterStaffForServiceColumns", () => {
  it("excludes explicit front desk", () => {
    const rows = [
      { id: "a", is_service_provider: true },
      { id: "b", is_service_provider: false },
    ];
    expect(filterStaffForServiceColumns(rows).map((r) => r.id)).toEqual(["a"]);
  });

  it("isExplicitServiceProvider matches filter", () => {
    expect(isExplicitServiceProvider({ is_service_provider: null })).toBe(true);
    expect(isExplicitServiceProvider({ is_service_provider: false })).toBe(false);
  });
});
