import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidateBookingSlotBeforePayment } from "../revalidate-booking-slot-before-payment";
import * as conflictCheck from "../conflict-check";
import * as calendarOverlap from "@/lib/public-booking/provider-calendar-block-overlap";

function createSupabaseForRevalidate(opts: {
  holdId?: string | null;
  holdMetaRows?: Array<{ id: string; metadata?: Record<string, unknown> }>;
  serviceRows?: Array<{
    staff_id: string | null;
    scheduled_start_at: string;
    scheduled_end_at: string;
  }>;
}) {
  const holdId = Object.prototype.hasOwnProperty.call(opts, "holdId") ? opts.holdId : "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const holdMetaRows = opts.holdMetaRows ?? [];
  const serviceRows = opts.serviceRows ?? [
    {
      staff_id: "staff-1",
      scheduled_start_at: "2026-06-01T10:00:00.000Z",
      scheduled_end_at: "2026-06-01T11:00:00.000Z",
    },
  ];

  return {
    from: vi.fn((table: string) => {
      if (table === "booking_services") {
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.order = () => Promise.resolve({
          data: serviceRows,
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

function createSupabaseWithCalendarBlock() {
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
              // 10:30-11:00 provider local time in Africa/Johannesburg.
              scheduled_start_at: "2026-06-10T08:30:00.000Z",
              scheduled_end_at: "2026-06-10T09:00:00.000Z",
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
              location_id: "loc-1",
              hold_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            },
            error: null,
          });
        return b;
      }
      if (table === "providers") {
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.maybeSingle = () => Promise.resolve({ data: { timezone: "Africa/Johannesburg" }, error: null });
        return b;
      }
      const rowsByTable: Record<string, unknown[]> = {
        availability_blocks: [],
        time_blocks: [
          {
            id: "tb-1",
            staff_id: "staff-1",
            date: "2026-06-10",
            start_time: "10:00",
            end_time: "11:00",
          },
        ],
        staff_days_off: [],
        staff_time_off: [],
      };
      const b: any = {
        select: () => b,
        eq: () => b,
        gt: () => b,
        lt: () => b,
        gte: () => b,
        lte: () => b,
        or: () => b,
        then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
          resolve({ data: rowsByTable[table] ?? [], error: null }),
      };
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

  it("checks holds against the full multi-service window while validating each service segment", async () => {
    const holdSpy = vi.spyOn(conflictCheck, "checkActiveHoldOverlap").mockResolvedValue(false);
    const segmentSpy = vi.spyOn(conflictCheck, "checkBookingConflict").mockResolvedValue({ hasConflict: false });
    vi.spyOn(calendarOverlap, "isProviderCalendarWindowBlocked").mockResolvedValue({
      blocked: false,
      reason: "",
    });

    const supabase = createSupabaseForRevalidate({
      serviceRows: [
        {
          staff_id: "staff-1",
          scheduled_start_at: "2026-06-01T10:00:00.000Z",
          scheduled_end_at: "2026-06-01T10:45:00.000Z",
        },
        {
          staff_id: "staff-2",
          scheduled_start_at: "2026-06-01T10:45:00.000Z",
          scheduled_end_at: "2026-06-01T12:00:00.000Z",
        },
      ],
    });

    const r = await revalidateBookingSlotBeforePayment(supabase, "booking-1");

    expect(r).toEqual({ ok: true });
    expect(holdSpy.mock.calls[0]?.[2].toISOString()).toBe("2026-06-01T10:00:00.000Z");
    expect(holdSpy.mock.calls[0]?.[3].toISOString()).toBe("2026-06-01T12:00:00.000Z");
    expect(segmentSpy).toHaveBeenCalledWith(
      supabase,
      "staff-1",
      new Date("2026-06-01T10:00:00.000Z"),
      new Date("2026-06-01T10:45:00.000Z"),
      0,
      "booking-1",
    );
    expect(segmentSpy).toHaveBeenCalledWith(
      supabase,
      "staff-2",
      new Date("2026-06-01T10:45:00.000Z"),
      new Date("2026-06-01T12:00:00.000Z"),
      0,
      "booking-1",
    );
  });

  it("fails safe when a provider-local time block overlaps the pre-payment window", async () => {
    vi.spyOn(conflictCheck, "checkActiveHoldOverlap").mockResolvedValue(false);
    vi.spyOn(conflictCheck, "checkBookingConflict").mockResolvedValue({ hasConflict: false });

    const supabase = createSupabaseWithCalendarBlock();

    const r = await revalidateBookingSlotBeforePayment(supabase, "booking-1");

    expect(r).toEqual({
      ok: false,
      code: "SLOT_NO_LONGER_AVAILABLE",
      message: "This time slot is no longer available. Please choose another time.",
    });
  });
});
