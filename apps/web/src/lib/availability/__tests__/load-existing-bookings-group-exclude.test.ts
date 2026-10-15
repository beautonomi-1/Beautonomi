import { describe, expect, it, vi } from "vitest";
import { loadExistingBookings } from "../load-constraints";

describe("loadExistingBookings group exclude", () => {
  it("filters out participant bookings belonging to the excluded group", async () => {
    const groupId = "11111111-1111-1111-1111-111111111111";
    const otherBookingId = "22222222-2222-2222-2222-222222222222";
    const query = {
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "provider_staff") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null }),
          };
        }
        if (table === "booking_services") {
          return query;
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };

    query.neq.mockImplementation(() => query);
    (query as { then?: unknown }).then = undefined;
    Object.assign(query, {
      then(onFulfilled: (v: unknown) => unknown) {
        return Promise.resolve({
          data: [
            {
              id: "bs-1",
              booking_id: "child-in-group",
              offering_id: "off-1",
              staff_id: "staff-1",
              scheduled_start_at: "2026-01-01T10:00:00",
              scheduled_end_at: "2026-01-01T11:00:00",
              duration_minutes: 60,
              bookings: { id: "child-in-group", status: "confirmed", group_booking_id: groupId },
              offerings: { buffer_minutes: 0, processing_minutes: 0, finishing_minutes: 0 },
            },
            {
              id: "bs-2",
              booking_id: otherBookingId,
              offering_id: "off-1",
              staff_id: "staff-1",
              scheduled_start_at: "2026-01-01T12:00:00",
              scheduled_end_at: "2026-01-01T13:00:00",
              duration_minutes: 60,
              bookings: { id: otherBookingId, status: "confirmed", group_booking_id: null },
              offerings: { buffer_minutes: 0, processing_minutes: 0, finishing_minutes: 0 },
            },
          ],
          error: null,
        }).then(onFulfilled);
      },
    });

    const rows = await loadExistingBookings(
      supabase as never,
      "staff-1",
      "2026-01-01",
      undefined,
      groupId,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.booking_id).toBe(otherBookingId);
  });
});
