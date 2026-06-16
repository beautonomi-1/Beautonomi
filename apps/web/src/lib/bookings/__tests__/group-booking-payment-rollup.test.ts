import { describe, expect, it } from "vitest";
import { computeGroupPaymentRollupFields } from "../group-booking-payment-rollup";

const GROUP_ID = "11111111-1111-1111-1111-111111111111";

describe("computeGroupPaymentRollupFields", () => {
  it("returns paid when child bookings are settled even if roster has no booking_id links", () => {
    const children = [
      {
        id: "b1",
        group_booking_id: GROUP_ID,
        status: "completed",
        total_amount: 120,
        total_paid: 120,
        total_refunded: 0,
        wallet_amount: 0,
        gift_card_amount: 0,
        payment_status: "paid",
        additional_charges: [],
      },
      {
        id: "b2",
        group_booking_id: GROUP_ID,
        status: "completed",
        total_amount: 80,
        total_paid: 80,
        total_refunded: 0,
        wallet_amount: 0,
        gift_card_amount: 0,
        payment_status: "paid",
        additional_charges: [],
      },
    ];

    const rollup = computeGroupPaymentRollupFields(GROUP_ID, children, 200);
    expect(rollup.is_invoiced).toBe(true);
    expect(rollup.payment_status).toBe("paid");
    expect(rollup.amount_paid).toBe(200);
    expect(rollup.balance_due).toBe(0);
  });

  it("returns not_invoiced when there are no child bookings", () => {
    const rollup = computeGroupPaymentRollupFields(GROUP_ID, [], 150);
    expect(rollup.is_invoiced).toBe(false);
    expect(rollup.payment_status).toBe("not_invoiced");
    expect(rollup.amount_paid).toBe(0);
  });

  it("returns partially_paid when only some child balance remains", () => {
    const children = [
      {
        id: "b1",
        group_booking_id: GROUP_ID,
        status: "booked",
        total_amount: 100,
        total_paid: 40,
        total_refunded: 0,
        wallet_amount: 0,
        gift_card_amount: 0,
        payment_status: "partially_paid",
        additional_charges: [],
      },
    ];

    const rollup = computeGroupPaymentRollupFields(GROUP_ID, children, 100);
    expect(rollup.payment_status).toBe("partially_paid");
    expect(rollup.amount_paid).toBe(40);
    expect(rollup.balance_due).toBeGreaterThan(0);
  });
});
