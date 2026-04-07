import { describe, it, expect, vi } from "vitest";
import {
  checkBookingSnapshotSegmentConflicts,
  type SnapshotLineForConflict,
} from "../conflict-check";

/** Minimal thenable query builder: each `from()` starts one query; resolves to `next()`. */
function createSequentialSupabase(responses: Array<{ data: unknown; error: unknown }>) {
  let call = 0;
  const next = () => responses[Math.min(call++, responses.length - 1)];

  const builder = (): any => {
    const b: any = {};
    for (const m of ["select", "eq", "neq", "lt", "gt"]) {
      b[m] = () => builder();
    }
    b.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(next()).then(onFulfilled);
    b.catch = (onRejected: (e: unknown) => unknown) => Promise.resolve(next()).catch(onRejected);
    return b;
  };

  return { from: vi.fn(() => builder()) } as any;
}

describe("checkBookingSnapshotSegmentConflicts", () => {
  const offeringBuffer = new Map<string, number>([["o1", 15]]);

  it("returns no conflict when every segment query returns empty", async () => {
    const supabase = createSequentialSupabase([{ data: [], error: null }]);
    const lines: SnapshotLineForConflict[] = [
      {
        offering_id: "o1",
        staff_id: "staff-a",
        scheduled_start_at: "2026-06-01T10:00:00.000Z",
        scheduled_end_at: "2026-06-01T11:00:00.000Z",
      },
      {
        offering_id: "o1",
        staff_id: "staff-a",
        scheduled_start_at: "2026-06-01T11:15:00.000Z",
        scheduled_end_at: "2026-06-01T12:00:00.000Z",
      },
    ];
    const r = await checkBookingSnapshotSegmentConflicts(supabase, "prov-1", lines, offeringBuffer);
    expect(r.hasConflict).toBe(false);
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it("returns conflict when an overlapping row passes buffer-adjusted overlap filter", async () => {
    const supabase = createSequentialSupabase([
      {
        data: [
          {
            booking_id: "b-existing",
            scheduled_start_at: "2026-06-01T10:30:00.000Z",
            scheduled_end_at: "2026-06-01T11:00:00.000Z",
            bookings: { status: "confirmed" },
            offerings: { buffer_minutes: 15 },
          },
        ],
        error: null,
      },
    ]);
    const lines: SnapshotLineForConflict[] = [
      {
        offering_id: "o1",
        staff_id: "staff-a",
        scheduled_start_at: "2026-06-01T10:00:00.000Z",
        scheduled_end_at: "2026-06-01T11:00:00.000Z",
      },
    ];
    const r = await checkBookingSnapshotSegmentConflicts(supabase, "prov-1", lines, offeringBuffer);
    expect(r.hasConflict).toBe(true);
    expect(r.conflictingBookings?.[0]?.booking_id).toBe("b-existing");
  });

  it("uses provider-wide conflict path when staff_id is null (solo / synthetic)", async () => {
    const supabase = createSequentialSupabase([{ data: [], error: null }]);
    const lines: SnapshotLineForConflict[] = [
      {
        offering_id: "o1",
        staff_id: null,
        scheduled_start_at: "2026-06-01T10:00:00.000Z",
        scheduled_end_at: "2026-06-01T11:00:00.000Z",
      },
    ];
    const r = await checkBookingSnapshotSegmentConflicts(supabase, "prov-1", lines, offeringBuffer);
    expect(r.hasConflict).toBe(false);
    expect(supabase.from).toHaveBeenCalledWith("booking_services");
  });
});
