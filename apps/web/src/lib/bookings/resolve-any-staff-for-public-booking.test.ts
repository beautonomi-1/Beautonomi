import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadEffectiveStaffShiftsMock,
  isProviderCalendarWindowBlockedMock,
  checkBookingSnapshotSegmentConflictsMock,
  resolveStaffLocationScopeMock,
} = vi.hoisted(() => ({
  loadEffectiveStaffShiftsMock: vi.fn(),
  isProviderCalendarWindowBlockedMock: vi.fn(),
  checkBookingSnapshotSegmentConflictsMock: vi.fn(),
  resolveStaffLocationScopeMock: vi.fn(),
}));

vi.mock("@/lib/availability/load-constraints", () => ({
  loadEffectiveStaffShifts: loadEffectiveStaffShiftsMock,
}));

vi.mock("@/lib/public-booking/provider-calendar-block-overlap", () => ({
  isProviderCalendarWindowBlocked: isProviderCalendarWindowBlockedMock,
}));

vi.mock("./conflict-check", () => ({
  checkBookingSnapshotSegmentConflicts: checkBookingSnapshotSegmentConflictsMock,
}));

vi.mock("@/lib/provider/staff-location-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/provider/staff-location-scope")>();
  return {
    ...actual,
    resolveStaffLocationScope: resolveStaffLocationScopeMock,
  };
});

import { pickFirstStaffForNullStaffLines } from "./resolve-any-staff-for-public-booking";

function makeSupabaseStaffList(ids: string[]) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: ids.map((id) => ({ id })),
      }),
    })),
  };
}

describe("pickFirstStaffForNullStaffLines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isProviderCalendarWindowBlockedMock.mockResolvedValue({ blocked: false });
    checkBookingSnapshotSegmentConflictsMock.mockResolvedValue({ hasConflict: false });
    resolveStaffLocationScopeMock.mockResolvedValue({ staffIds: null, mode: "all" });
  });

  it("does not assign an any-staff candidate whose working hours do not cover the green slot", async () => {
    loadEffectiveStaffShiftsMock.mockImplementation(async (_db, staffId: string) => {
      if (staffId === "staff-b") {
        return {
          workHoursEnabledEffective: true,
          staffShifts: [
            {
              id: "shift-b",
              staff_id: "staff-b",
              date: "2026-06-15",
              start_time: "11:00:00",
              end_time: "19:00:00",
              is_recurring: false,
            },
          ],
        };
      }
      return {
        workHoursEnabledEffective: true,
        staffShifts: [
          {
            id: "shift-a",
            staff_id: "staff-a",
            date: "2026-06-15",
            start_time: "09:00:00",
            end_time: "17:00:00",
            is_recurring: false,
          },
        ],
      };
    });

    const result = await pickFirstStaffForNullStaffLines({
      supabaseAdmin: makeSupabaseStaffList(["staff-b", "staff-a"]) as never,
      providerId: "provider-1",
      locationId: null,
      providerTimeZone: "UTC",
      bookingServicesData: [
        {
          offering_id: "offering-1",
          staff_id: null,
          scheduled_start_at: "2026-06-15T09:00:00.000Z",
          scheduled_end_at: "2026-06-15T10:00:00.000Z",
        },
      ],
      offeringBufferMinutesById: new Map([["offering-1", 0]]),
    });

    expect(result).toEqual({ ok: true, staffId: "staff-a" });
  });

  it("does not assign staff who are outside the selected branch", async () => {
    resolveStaffLocationScopeMock.mockResolvedValue({ staffIds: ["staff-b"], mode: "strict" });

    loadEffectiveStaffShiftsMock.mockResolvedValue({
      workHoursEnabledEffective: true,
      staffShifts: [
        {
          id: "shift",
          staff_id: "staff-b",
          date: "2026-06-15",
          start_time: "09:00:00",
          end_time: "17:00:00",
          is_recurring: false,
        },
      ],
    });

    const result = await pickFirstStaffForNullStaffLines({
      supabaseAdmin: makeSupabaseStaffList(["staff-a", "staff-b"]) as never,
      providerId: "provider-1",
      locationId: "loc-b",
      providerTimeZone: "UTC",
      bookingServicesData: [
        {
          offering_id: "offering-1",
          staff_id: null,
          scheduled_start_at: "2026-06-15T09:00:00.000Z",
          scheduled_end_at: "2026-06-15T10:00:00.000Z",
        },
      ],
      offeringBufferMinutesById: new Map([["offering-1", 0]]),
    });

    expect(result).toEqual({ ok: true, staffId: "staff-b" });
    expect(resolveStaffLocationScopeMock).toHaveBeenCalled();
  });
});
