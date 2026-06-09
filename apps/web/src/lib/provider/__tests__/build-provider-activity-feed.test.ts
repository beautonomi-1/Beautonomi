import { describe, expect, it } from "vitest";
import {
  bookingCreatedLabel,
  mapBookingCancelledActivity,
  mapBookingCompletedActivity,
  mapBookingConfirmedActivity,
  mapBookingCreatedActivity,
  mapBookingNoShowActivity,
  mapBookingRescheduledActivity,
  mapBookingServiceStartedActivity,
  mapLedgerRowToActivity,
  mapNewClientActivity,
  mergeActivityFeedItems,
  newClientActivityLabel,
  productOrderActivityLabel,
  shouldIncludeProviderClientRow,
} from "../build-provider-activity-feed";

describe("build-provider-activity-feed mappers", () => {
  it("maps new appointments by created_at without rewriting status", () => {
    const item = mapBookingCreatedActivity({
      id: "b1",
      booking_number: "BN-42",
      created_at: "2026-06-01T09:00:00.000Z",
      status: "completed",
      customers: { full_name: "Jane Doe" },
    });
    expect(item.type).toBe("booking_created");
    expect(item.description).toContain("New appointment");
    expect(item.description).toContain("BN-42");
    expect(item.description).toContain("Jane Doe");
    expect(item.created_at).toBe("2026-06-01T09:00:00.000Z");
  });

  it("maps completions by completed_at", () => {
    const item = mapBookingCompletedActivity({
      id: "b2",
      completed_at: "2026-06-05T14:00:00.000Z",
      customers: { full_name: "Sam" },
    });
    expect(item.type).toBe("booking_completed");
    expect(item.created_at).toBe("2026-06-05T14:00:00.000Z");
  });

  it("maps cancellations by cancelled_at", () => {
    const item = mapBookingCancelledActivity({
      id: "b3",
      cancelled_at: "2026-06-04T11:00:00.000Z",
      customers: null,
    });
    expect(item.type).toBe("booking_cancelled");
    expect(item.description).toContain("Walk-in");
  });

  it("maps no-shows with dedicated type", () => {
    const item = mapBookingNoShowActivity({
      id: "b4",
      updated_at: "2026-06-03T16:00:00.000Z",
      customers: { full_name: "Alex" },
    });
    expect(item.type).toBe("booking_no_show");
    expect(item.description).toContain("No-show");
  });

  it("labels retail orders by collection model", () => {
    expect(productOrderActivityLabel({ order_source: "walk_in" })).toBe("Walk-in retail sale");
    expect(
      productOrderActivityLabel({ order_source: "online", payment_method: "cash" }),
    ).toBe("Online product order paid (you collected)");
    expect(
      productOrderActivityLabel({ order_source: "online", payment_method: "paystack" }),
    ).toBe("Online product order paid");
  });

  it("labels online customer bookings distinctly from provider-created ones", () => {
    expect(bookingCreatedLabel({ booking_source: "online" })).toBe("Customer booked online");
    expect(bookingCreatedLabel({ booking_source: "walk_in" })).toBe("Walk-in appointment");
    expect(bookingCreatedLabel({ booking_source: "provider" })).toBe("New appointment");
  });

  it("maps rescheduled and confirmed booking events", () => {
    const booking = { id: "b5", booking_number: "BN-9", customers: { full_name: "Riley" } };
    expect(mapBookingRescheduledActivity(booking, { id: "e1", created_at: "2026-06-02T10:00:00.000Z" }).type).toBe(
      "booking_rescheduled",
    );
    expect(mapBookingConfirmedActivity(booking, { id: "e2", created_at: "2026-06-02T11:00:00.000Z" }).type).toBe(
      "booking_confirmed",
    );
  });

  it("mergeActivityFeedItems drops invalid timestamps and respects limit", () => {
    const merged = mergeActivityFeedItems(
      [
        { id: "a", type: "x", description: "old", created_at: "2026-06-01T10:00:00.000Z" },
        { id: "b", type: "x", description: "new", created_at: "2026-06-03T10:00:00.000Z" },
        { id: "c", type: "x", description: "bad", created_at: "" },
      ],
      1,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("b");
  });

  it("maps service started booking events", () => {
    const item = mapBookingServiceStartedActivity(
      { id: "b6", customers: { full_name: "Jamie" } },
      { id: "e3", created_at: "2026-06-04T09:00:00.000Z" },
    );
    expect(item.type).toBe("booking_started");
    expect(item.description).toContain("Service started");
  });

  it("maps subscription, ads, gift card, and membership ledger rows", () => {
    expect(
      mapLedgerRowToActivity({
        id: "l1",
        transaction_type: "provider_subscription_payment",
        net: -199,
        amount: -199,
        created_at: "2026-06-01T10:00:00.000Z",
      }).type,
    ).toBe("subscription_charge");
    expect(
      mapLedgerRowToActivity({
        id: "l2",
        transaction_type: "provider_ads_payment",
        net: -50,
        amount: -50,
        created_at: "2026-06-01T10:00:00.000Z",
      }).type,
    ).toBe("ads_payment");
    expect(
      mapLedgerRowToActivity({
        id: "l3",
        transaction_type: "gift_card_sale",
        net: 100,
        amount: 100,
        created_at: "2026-06-01T10:00:00.000Z",
      }).type,
    ).toBe("gift_card_sale");
    expect(
      mapLedgerRowToActivity({
        id: "l4",
        transaction_type: "membership_sale",
        net: 80,
        amount: 80,
        created_at: "2026-06-01T10:00:00.000Z",
      }).type,
    ).toBe("membership_sale");
  });

  it("includes explicit CRM client sources and excludes auto booking CRM rows", () => {
    expect(
      shouldIncludeProviderClientRow({
        id: "c1",
        created_at: "2026-06-01T10:00:00.000Z",
        relationship_source: "manual_new_customer",
      }),
    ).toBe(true);
    expect(
      shouldIncludeProviderClientRow({
        id: "c2",
        created_at: "2026-06-01T10:00:00.000Z",
        relationship_source: "booking",
      }),
    ).toBe(false);
    expect(
      shouldIncludeProviderClientRow({
        id: "c3",
        created_at: "2026-06-01T10:00:00.000Z",
        relationship_source: "manual",
        created_by_user_id: null,
      }),
    ).toBe(false);
    const item = mapNewClientActivity({
      id: "c4",
      created_at: "2026-06-01T10:00:00.000Z",
      relationship_source: "import",
      users: { full_name: "Taylor" },
    });
    expect(item?.type).toBe("new_client");
    expect(item?.description).toContain(newClientActivityLabel("import"));
    expect(item?.description).toContain("Taylor");
  });
});
