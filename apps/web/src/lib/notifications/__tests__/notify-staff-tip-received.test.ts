import { describe, expect, it } from "vitest";
import { notifyStaffTipReceivedForBooking } from "../notify-staff-event";

describe("notifyStaffTipReceivedForBooking", () => {
  it("returns 0 when the booking has no tip finance row", async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    };

    const sent = await notifyStaffTipReceivedForBooking(admin as never, "booking-empty");
    expect(sent).toBe(0);
  });

  it("looks up tip FTs and no-ops when earnings lines are empty", async () => {
    const queried: string[] = [];
    const admin = {
      from: (table: string) => {
        queried.push(table);
        if (table === "finance_transactions") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: [{ id: "ft-tip-1" }], error: null }),
              }),
            }),
          };
        }
        if (table === "staff_earnings_lines") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  gt: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const sent = await notifyStaffTipReceivedForBooking(admin as never, "booking-1");
    expect(sent).toBe(0);
    expect(queried).toEqual(["finance_transactions", "staff_earnings_lines"]);
  });
});
