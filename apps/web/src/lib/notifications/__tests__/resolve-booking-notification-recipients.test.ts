import { describe, expect, it, vi } from "vitest";

import {
  collectAssignedStaffIds,
  resolveBookingProviderRecipients,
} from "@/lib/notifications/resolve-booking-notification-recipients";

const OWNER = "user-owner";
const TEAM = [OWNER, "user-staff-a", "user-staff-b", "user-staff-c"];

function loaders(overrides?: Partial<{ staff: string[]; team: string[] }>) {
  return {
    loadStaffUserIds: vi.fn(async () => overrides?.staff ?? []),
    loadTeamUserIds: vi.fn(async () => overrides?.team ?? TEAM),
  };
}

describe("collectAssignedStaffIds", () => {
  it("collects distinct staff ids from booking-level and per-service assignments", () => {
    expect(
      collectAssignedStaffIds({
        staff_id: "st-1",
        booking_services: [{ staff_id: "st-1" }, { staff_id: "st-2" }, { staff_id: null }, null],
        services: [{ staff_id: "st-3" }],
      }),
    ).toEqual(["st-1", "st-2", "st-3"]);
    expect(collectAssignedStaffIds({ booking_services: [{ staff_id: null }] })).toEqual([]);
    expect(collectAssignedStaffIds(null)).toEqual([]);
  });
});

describe("resolveBookingProviderRecipients (OneSignal fan-out default)", () => {
  it("assigned staff + owner when the booking has assignees with logins (NOT the whole team)", async () => {
    const l = loaders({ staff: ["user-staff-b"] });
    const result = await resolveBookingProviderRecipients({
      providerId: "prov-1",
      ownerUserId: OWNER,
      assignedStaffIds: ["st-2"],
      loaders: l,
    });
    expect(result.basis).toBe("assignee_and_owner");
    expect(result.recipients).toEqual([OWNER, "user-staff-b"]);
    expect(l.loadStaffUserIds).toHaveBeenCalledWith("prov-1", ["st-2"]);
    expect(l.loadTeamUserIds).not.toHaveBeenCalled();
  });

  it("de-duplicates when the assignee IS the owner", async () => {
    const l = loaders({ staff: [OWNER] });
    const result = await resolveBookingProviderRecipients({
      providerId: "prov-1",
      ownerUserId: OWNER,
      assignedStaffIds: ["st-owner"],
      loaders: l,
    });
    expect(result.recipients).toEqual([OWNER]);
    expect(result.basis).toBe("assignee_and_owner");
  });

  it("falls back to team-wide only when the booking has no assignee", async () => {
    const l = loaders();
    const result = await resolveBookingProviderRecipients({
      providerId: "prov-1",
      ownerUserId: OWNER,
      assignedStaffIds: [],
      loaders: l,
    });
    expect(result.basis).toBe("team");
    expect(result.recipients).toEqual(TEAM);
    expect(l.loadStaffUserIds).not.toHaveBeenCalled();
  });

  it("falls back to team-wide when assignees have no app login", async () => {
    const l = loaders({ staff: [] });
    const result = await resolveBookingProviderRecipients({
      providerId: "prov-1",
      ownerUserId: OWNER,
      assignedStaffIds: ["st-no-login"],
      loaders: l,
    });
    expect(result.basis).toBe("team");
    expect(result.recipients).toEqual(TEAM);
  });

  it("owner-only when both loaders fail; never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const l = {
      loadStaffUserIds: vi.fn(async () => {
        throw new Error("db down");
      }),
      loadTeamUserIds: vi.fn(async () => {
        throw new Error("db down");
      }),
    };
    const result = await resolveBookingProviderRecipients({
      providerId: "prov-1",
      ownerUserId: OWNER,
      assignedStaffIds: ["st-1"],
      loaders: l,
    });
    expect(result).toEqual({ recipients: [OWNER], basis: "owner_only" });
    warn.mockRestore();
  });

  it("owner always first even when the team loader lists them later", async () => {
    const l = loaders({ team: ["user-staff-a", OWNER] });
    const result = await resolveBookingProviderRecipients({
      providerId: "prov-1",
      ownerUserId: OWNER,
      assignedStaffIds: [],
      loaders: l,
    });
    expect(result.recipients).toEqual([OWNER, "user-staff-a"]);
  });

  it("no providerId → owner only, no loader calls", async () => {
    const l = loaders();
    const result = await resolveBookingProviderRecipients({
      providerId: null,
      ownerUserId: OWNER,
      assignedStaffIds: ["st-1"],
      loaders: l,
    });
    expect(result).toEqual({ recipients: [OWNER], basis: "owner_only" });
    expect(l.loadStaffUserIds).not.toHaveBeenCalled();
    expect(l.loadTeamUserIds).not.toHaveBeenCalled();
  });
});
