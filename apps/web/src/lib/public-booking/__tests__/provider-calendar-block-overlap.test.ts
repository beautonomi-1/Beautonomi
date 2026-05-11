import { describe, expect, it } from "vitest";
import { isProviderCalendarWindowBlocked } from "../provider-calendar-block-overlap";

function makeSupabaseStub(rowsByTable: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gt: () => chain,
        lt: () => chain,
        gte: () => chain,
        lte: () => chain,
        or: () => chain,
        maybeSingle: async () => ({
          data: (rowsByTable[table] ?? [])[0] ?? null,
          error: null,
        }),
        then(resolve: (value: { data: unknown[]; error: null }) => void) {
          resolve({ data: rowsByTable[table] ?? [], error: null });
        },
      };
      return chain;
    },
  };
}

describe("isProviderCalendarWindowBlocked", () => {
  it("interprets time_blocks in the provider timezone", async () => {
    const supabase = makeSupabaseStub({
      providers: [{ timezone: "Africa/Johannesburg" }],
      availability_blocks: [],
      time_blocks: [
        {
          id: "time-block-1",
          staff_id: "staff-1",
          date: "2026-06-10",
          start_time: "10:00",
          end_time: "11:00",
        },
      ],
      staff_days_off: [],
      staff_time_off: [],
    });

    const result = await isProviderCalendarWindowBlocked(supabase as never, {
      providerId: "provider-1",
      locationId: "loc-1",
      staffId: "staff-1",
      // 10:30-11:00 in Africa/Johannesburg.
      startAt: new Date("2026-06-10T08:30:00.000Z"),
      endAt: new Date("2026-06-10T09:00:00.000Z"),
    });

    expect(result).toEqual({ blocked: true, reason: "Overlaps time block" });
  });

  it("uses provider-local calendar days for staff day-off checks", async () => {
    const supabase = makeSupabaseStub({
      providers: [{ timezone: "Africa/Johannesburg" }],
      availability_blocks: [],
      time_blocks: [],
      staff_days_off: [{ date: "2026-06-10" }],
      staff_time_off: [],
    });

    const result = await isProviderCalendarWindowBlocked(supabase as never, {
      providerId: "provider-1",
      staffId: "staff-1",
      // 00:30-01:00 on 2026-06-10 in Africa/Johannesburg, but previous UTC date.
      startAt: new Date("2026-06-09T22:30:00.000Z"),
      endAt: new Date("2026-06-09T23:00:00.000Z"),
    });

    expect(result).toEqual({ blocked: true, reason: "Staff day off" });
  });
});
