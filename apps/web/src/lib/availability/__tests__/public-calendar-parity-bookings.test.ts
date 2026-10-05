import { describe, expect, it } from "vitest";
import { loadPublicCalendarParityBookings } from "@/lib/availability/public-calendar-parity-bookings";

function makeSupabaseStub(rowsByTable: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const state: {
        table: string;
        gt: Array<{ column: string; value: string }>;
        lt: Array<{ column: string; value: string }>;
      } = { table, gt: [], lt: [] };
      const chain = {
        select: () => chain,
        eq: () => chain,
        gt: (column: string, value: string) => {
          state.gt.push({ column, value });
          return chain;
        },
        lt: (column: string, value: string) => {
          state.lt.push({ column, value });
          return chain;
        },
        lte: () => chain,
        gte: () => chain,
        in: () => chain,
        then(resolve: (value: { data: unknown[]; error: null }) => void) {
          let data = rowsByTable[state.table] ?? [];
          for (const filter of state.gt) {
            data = data.filter((row) => String((row as Record<string, unknown>)[filter.column]) > filter.value);
          }
          for (const filter of state.lt) {
            data = data.filter((row) => String((row as Record<string, unknown>)[filter.column]) < filter.value);
          }
          resolve({ data, error: null });
        },
      };
      return chain;
    },
  };
}

describe("loadPublicCalendarParityBookings", () => {
  it("reads availability blocks with the admin client (RLS hides them from anon/customers)", async () => {
    const userDb = makeSupabaseStub({
      availability_blocks: [],
    });
    const admin = makeSupabaseStub({
      staff_time_off: [],
      staff_days_off: [],
      availability_blocks: [
        {
          id: "blk",
          staff_id: null,
          location_id: null,
          start_at: "2026-06-10T08:00:00.000Z",
          end_at: "2026-06-10T09:00:00.000Z",
        },
      ],
    });

    const rows = await loadPublicCalendarParityBookings(userDb as never, admin as never, {
      providerId: "provider-a",
      date: "2026-06-10",
      slotStaffId: "staff-a",
      staffIdsForTimeOff: [],
      providerTimeZone: "Africa/Johannesburg",
    });

    expect(rows).toHaveLength(1);
  });

  it("queries provider-local day boundaries for availability blocks", async () => {
    const db = makeSupabaseStub({});
    const admin = makeSupabaseStub({
      staff_time_off: [],
      staff_days_off: [],
      availability_blocks: [
        {
          id: "overnight-block",
          staff_id: "staff-a",
          location_id: null,
          // 00:30-01:30 on 2026-06-10 in Africa/Johannesburg.
          start_at: "2026-06-09T22:30:00.000Z",
          end_at: "2026-06-09T23:30:00.000Z",
        },
      ],
    });

    const rows = await loadPublicCalendarParityBookings(db as never, admin as never, {
      providerId: "provider-a",
      date: "2026-06-10",
      slotStaffId: "staff-a",
      staffIdsForTimeOff: [],
      providerTimeZone: "Africa/Johannesburg",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].scheduled_start_at).toBe("2026-06-09T22:30:00.000Z");
  });
});
