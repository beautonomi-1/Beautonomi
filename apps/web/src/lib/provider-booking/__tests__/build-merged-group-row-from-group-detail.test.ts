import { describe, expect, it } from "vitest";

import { buildMergedGroupRowFromGroupDetailApi } from "@/lib/provider-booking/build-merged-group-row-from-group-detail";

describe("buildMergedGroupRowFromGroupDetailApi", () => {
  it("uses linked child totals when higher than group session total", () => {
    const row = buildMergedGroupRowFromGroupDetailApi(
      {
        id: "group-1",
        ref_number: "GB-001",
        status: "booked",
        scheduled_at: "2026-05-16T12:00:00.000Z",
        provider_id: "provider-1",
        travel_fee: 100,
        total_price: 400,
        booking_participants: [
          {
            id: "p-1",
            participant_name: "Alice",
            price: 300,
            is_primary_contact: true,
          },
        ],
        products: [],
        bookings: [
          {
            id: "b-1",
            group_booking_id: "group-1",
            status: "confirmed",
            total_amount: 550,
            total_paid: 100,
            total_refunded: 0,
            wallet_amount: 0,
            gift_card_amount: 0,
            payment_status: "partially_paid",
            tip_amount: 30,
            additional_charges: [],
          },
        ],
      },
      { lastResortCurrency: "ZAR", staffName: null, locationRow: null },
    );

    expect(row.total_amount).toBe(550);
    expect(row.tip_amount).toBe(30);
  });

  it("falls back to group session total when no child bookings exist", () => {
    const row = buildMergedGroupRowFromGroupDetailApi(
      {
        id: "group-2",
        ref_number: "GB-002",
        status: "booked",
        scheduled_at: "2026-05-16T12:00:00.000Z",
        provider_id: "provider-1",
        travel_fee: 50,
        total_price: 450,
        booking_participants: [
          {
            id: "p-1",
            participant_name: "Bob",
            price: 400,
            is_primary_contact: true,
          },
        ],
        products: [],
        bookings: [],
      },
      { lastResortCurrency: "ZAR", staffName: null, locationRow: null },
    );

    expect(row.total_amount).toBe(450);
    expect(row.tip_amount).toBe(0);
  });
});
