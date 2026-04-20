import { describe, it, expect, vi } from "vitest";
import {
  computeSequentialServiceWindow,
  rescheduleBookingServicesSequential,
  updateAllBookingServicesStaff,
} from "../reschedule-booking-services";

describe("computeSequentialServiceWindow", () => {
  it("chains durations from anchor (PATCH / check-availability total span alignment)", () => {
    const anchor = "2026-06-01T10:00:00.000Z";
    const win = computeSequentialServiceWindow(anchor, [30, 45, 15]);
    expect(win.start.toISOString()).toBe(anchor);
    expect(win.end.getTime() - win.start.getTime()).toBe(90 * 60 * 1000);
    expect(win.totalMinutes).toBe(90);
  });

  it("treats non-positive segment lengths like the DB update path (fallback to 60m)", () => {
    const win = computeSequentialServiceWindow("2026-06-01T10:00:00.000Z", [0, NaN]);
    expect(win.totalMinutes).toBe(120);
  });
});

describe("rescheduleBookingServicesSequential", () => {
  it("updates each row with chained times and optional staff on all rows", async () => {
    const updates: Array<{ patch: Record<string, unknown>; rowId: string }> = [];
    let fromCalls = 0;
    const supabase = {
      from: vi.fn(() => {
        fromCalls += 1;
        if (fromCalls === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [
                { id: "bs-1", duration_minutes: 30 },
                { id: "bs-2", duration_minutes: 60 },
              ],
              error: null,
            }),
          };
        }
        return {
          update: vi.fn((patch: Record<string, unknown>) => ({
            eq: vi.fn((col: string, rowId: string) => {
              updates.push({ patch, rowId });
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }),
    };

    await rescheduleBookingServicesSequential(supabase as any, "book-1", "2026-06-01T10:00:00.000Z", {
      staffId: "staff-a",
    });

    expect(updates).toHaveLength(2);
    expect(updates[0].patch.staff_id).toBe("staff-a");
    const t0 = new Date(String(updates[0].patch.scheduled_start_at)).getTime();
    const t1 = new Date(String(updates[1].patch.scheduled_start_at)).getTime();
    expect(t1 - t0).toBe(30 * 60 * 1000);
  });

  it("does not set staff_id when options omit staffId", async () => {
    const updates: Record<string, unknown>[] = [];
    let fromCalls = 0;
    const supabase = {
      from: vi.fn(() => {
        fromCalls += 1;
        if (fromCalls === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [{ id: "bs-1", duration_minutes: 60 }],
              error: null,
            }),
          };
        }
        return {
          update: vi.fn((patch: Record<string, unknown>) => ({
            eq: vi.fn(() => {
              updates.push(patch);
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }),
    };

    await rescheduleBookingServicesSequential(supabase as any, "book-1", "2026-06-01T10:00:00.000Z");
    expect(updates[0]).not.toHaveProperty("staff_id");
    expect(updates[0].scheduled_start_at).toBeDefined();
  });
});

describe("updateAllBookingServicesStaff", () => {
  it("updates all rows for booking_id", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ update })) };

    await updateAllBookingServicesStaff(supabase as any, "book-1", "staff-x");

    expect(update).toHaveBeenCalledWith({ staff_id: "staff-x" });
    expect(eq).toHaveBeenCalledWith("booking_id", "book-1");
  });
});
