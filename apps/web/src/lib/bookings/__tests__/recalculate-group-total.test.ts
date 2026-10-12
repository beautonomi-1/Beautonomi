import { describe, expect, it, vi } from "vitest";
import {
  participantRowCountsTowardGroupTotal,
  recalculateGroupBookingTotal,
} from "../recalculate-group-total";

describe("participantRowCountsTowardGroupTotal", () => {
  it("includes inline roster rows without booking_id", () => {
    expect(participantRowCountsTowardGroupTotal({ booking_id: null, price: 50 })).toBe(true);
  });

  it("excludes linked bookings that are cancelled or no_show", () => {
    expect(
      participantRowCountsTowardGroupTotal({
        booking_id: "b1",
        price: 100,
        bookings: { status: "cancelled" },
      })
    ).toBe(false);
    expect(
      participantRowCountsTowardGroupTotal({
        booking_id: "b2",
        price: 100,
        bookings: { status: "no_show" },
      })
    ).toBe(false);
  });

  it("includes active linked bookings", () => {
    expect(
      participantRowCountsTowardGroupTotal({
        booking_id: "b3",
        price: 80,
        bookings: { status: "confirmed" },
      })
    ).toBe(true);
  });
});

describe("recalculateGroupBookingTotal", () => {
  it("persists total_price from active participants only", async () => {
    const groupUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const admin = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "group_bookings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    products: [],
                    travel_fee: 0,
                    location_type: "at_salon",
                    package_id: null,
                    provider_id: "prov-1",
                    location_id: null,
                    service_id: null,
                  },
                  error: null,
                }),
              }),
            }),
            update: groupUpdate,
          };
        }
        if (table === "booking_participants") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    price: 200,
                    service_id: "s1",
                    booking_id: "b-active",
                    bookings: { status: "confirmed" },
                  },
                  {
                    price: 150,
                    service_id: "s2",
                    booking_id: "b-cancelled",
                    bookings: { status: "cancelled" },
                  },
                  {
                    price: 75,
                    service_id: "s3",
                    booking_id: null,
                    bookings: null,
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };

    await recalculateGroupBookingTotal(admin as never, "group-1");

    expect(groupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        total_price: 275,
      })
    );
  });
});
