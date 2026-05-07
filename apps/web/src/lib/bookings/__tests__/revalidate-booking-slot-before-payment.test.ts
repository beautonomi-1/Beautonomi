import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidateBookingSlotBeforePayment } from "../revalidate-booking-slot-before-payment";
import * as conflictCheck from "../conflict-check";
import * as calendarOverlap from "@/lib/public-booking/provider-calendar-block-overlap";

function createSupabaseForRevalidate(opts: {
  holdId?: string | null;
  holdMetaRows?: Array<{ id: string; metadata?: Record<string, unknown> }>;
}) {
  const holdId = Object.prototype.hasOwnProperty.call(opts, "holdId") ? opts.holdId : "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const holdMetaRows = opts.holdMetaRows ?? [];

  return {
    from: vi.fn((table: string) => {
      if (table === "booking_services") {
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.order = () => Promise.resolve({
          data: [
            {
              staff_id: "staff-1",
              scheduled_start_at: "2026-06-01T10:00:00.000Z",
              scheduled_end_at: "2026-06-01T11:00:00.000Z",
            },
          ],
          error: null,
        });
        return b;
      }
      if (table === "bookings") {
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.maybeSingle = () =>
          Promise.resolve({
            data: {
              provider_id: "prov-1",
              location_id: null,
              hold_id: holdId,
            },
            error: null,
          });
        return b;
      }
      if (table === "booking_holds") {
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.in = () => b;
        b.limit = () =>
          Promise.resolve({
            data: holdMetaRows,
            error: null,
          });
        return b;
      }
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      return b;
    }),
  } as any;
}

describe("revalidateBookingSlotBeforePayment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards booking hold_id as excludeHoldId to checkActiveHoldOverlap", async () => {
    const holdSpy = vi.spyOn(conflictCheck, "checkActiveHoldOverlap").mockResolvedValue(false);
    vi.spyOn(conflictCheck, "checkBookingConflict").mockResolvedValue({ hasConflict: false });
    vi.spyOn(calendarOverlap, "isProviderCalendarWindowBlocked").mockResolvedValue({
      blocked: false,
      reason: "",
    });

    const supabase = createSupabaseForRevalidate({
      holdId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });

    const r = await revalidateBookingSlotBeforePayment(supabase, "booking-1");
    expect(r).toEqual({ ok: true });
    expect(holdSpy.mock.calls[0]?.[4]).toMatchObject({
      dbStaffId: "staff-1",
      excludeHoldId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
  });

  it("resolves excludeHoldId from booking_holds metadata when booking.hold_id is null", async () => {
    const holdSpy = vi.spyOn(conflictCheck, "checkActiveHoldOverlap").mockResolvedValue(false);
    vi.spyOn(conflictCheck, "checkBookingConflict").mockResolvedValue({ hasConflict: false });
    vi.spyOn(calendarOverlap, "isProviderCalendarWindowBlocked").mockResolvedValue({
      blocked: false,
      reason: "",
    });

    const supabase = createSupabaseForRevalidate({
      holdId: null,
      holdMetaRows: [
        {
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          metadata: { booking_id: "booking-1" },
        },
      ],
    });

    const r = await revalidateBookingSlotBeforePayment(supabase, "booking-1");
    expect(r).toEqual({ ok: true });
    expect(holdSpy.mock.calls[0]?.[4]).toMatchObject({
      excludeHoldId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });
  });
});
