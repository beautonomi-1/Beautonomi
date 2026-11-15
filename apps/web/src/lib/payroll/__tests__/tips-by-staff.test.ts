import { describe, expect, it } from "vitest";
import { tipsByStaffFromLedger } from "../tips-helper";
import { liveEarningsTotals } from "../staff-earnings-from-lines";

const split = [
  { booking_id: "saturday", staff_id: "stylist-a", amount: 10 },
  { booking_id: "saturday", staff_id: "stylist-b", amount: 10 },
];

describe("tipsByStaffFromLedger", () => {
  it("pays the tip that was received, split the way the appointment shared it", () => {
    const tips = tipsByStaffFromLedger(
      [{ booking_id: "saturday", transaction_type: "tip", net: 20 }],
      split,
    );
    expect(tips.get("stylist-a")).toBe(10);
    expect(tips.get("stylist-b")).toBe(10);
  });

  it("includes a later tip on the same appointment", () => {
    const tips = tipsByStaffFromLedger(
      [
        { booking_id: "saturday", transaction_type: "tip", net: 20 },
        { booking_id: "saturday", transaction_type: "tip", amount: 10 },
      ],
      split,
    );
    expect(tips.get("stylist-a")).toBe(15);
    expect(tips.get("stylist-b")).toBe(15);
  });

  it("takes a returned tip off and leaves a service refund alone", () => {
    const tips = tipsByStaffFromLedger(
      [
        { booking_id: "saturday", transaction_type: "tip", net: 20 },
        { booking_id: "saturday", transaction_type: "refund", net: -20, refund_component: "tip" },
        { booking_id: "saturday", transaction_type: "refund", net: -100, refund_component: "provider_earnings" },
      ],
      split,
    );
    expect(tips.get("stylist-a")).toBe(0);
    expect(tips.get("stylist-b")).toBe(0);
  });

  it("makes three stylists' tip shares add up to the tip", () => {
    const tips = tipsByStaffFromLedger(
      [{ booking_id: "saturday", transaction_type: "tip", net: 200 }],
      [
        { booking_id: "saturday", staff_id: "alex", amount: 1 },
        { booking_id: "saturday", staff_id: "jo", amount: 1 },
        { booking_id: "saturday", staff_id: "sam", amount: 1 },
      ],
    );
    expect(tips.get("alex")).toBe(66.67);
    expect(tips.get("jo")).toBe(66.67);
    expect(tips.get("sam")).toBe(66.66);
  });
});

describe("liveEarningsTotals tips", () => {
  it("uses the paid tip when nothing was stored on a line", () => {
    const live = liveEarningsTotals(
      { commission: 0, tips: 0, adjustments: 0, total: 0 },
      0,
      30,
    );
    expect(live.tips).toBe(30);
    expect(live.total).toBe(30);
  });

  it("keeps a tip already stored on a line", () => {
    const live = liveEarningsTotals(
      { commission: 0, tips: 20, adjustments: 0, total: 20 },
      0,
      30,
    );
    expect(live.tips).toBe(20);
  });
});
