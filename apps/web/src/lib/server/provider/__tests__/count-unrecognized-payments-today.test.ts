import { describe, expect, it, vi } from "vitest";
import { countUnrecognizedPaymentsToday } from "../count-unrecognized-payments-today";

describe("countUnrecognizedPaymentsToday", () => {
  it("returns 0 when no online payments today", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "bookings") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [{ id: "booking-1" }] }),
            }),
          };
        }
        if (table === "booking_payments") {
          return {
            select: () => ({
              in: () => ({
                eq: () => ({
                  gte: () => ({
                    lte: () => Promise.resolve({ data: [] }),
                  }),
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) };
      }),
    };

    const count = await countUnrecognizedPaymentsToday(
      supabase as never,
      "provider-1",
      "Africa/Johannesburg",
    );
    expect(count).toBe(0);
  });
});
