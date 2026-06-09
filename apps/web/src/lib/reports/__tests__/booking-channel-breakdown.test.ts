import { describe, expect, it } from "vitest";
import {
  CHANNEL_BASIS_NOTE,
  classifyRevenueStream,
  computeBookingChannelBreakdown,
  computeOrderSourceBreakdown,
  isLiabilityRevenueType,
  isRecognizedRevenueType,
  normalizeBookingChannel,
  normalizeOrderSource,
} from "../booking-channel-breakdown";

describe("normalizeBookingChannel", () => {
  it("maps null to online", () => {
    expect(normalizeBookingChannel(null)).toBe("online");
    expect(normalizeBookingChannel(undefined)).toBe("online");
  });

  it("accepts known channels", () => {
    expect(normalizeBookingChannel("walk_in")).toBe("walk_in");
    expect(normalizeBookingChannel("provider")).toBe("provider");
  });

  it("returns unknown for invalid values", () => {
    expect(normalizeBookingChannel("invalid")).toBe("unknown");
  });
});

describe("normalizeOrderSource", () => {
  it("maps null to online", () => {
    expect(normalizeOrderSource(null)).toBe("online");
  });

  it("accepts known sources", () => {
    expect(normalizeOrderSource("appointment")).toBe("appointment");
    expect(normalizeOrderSource("walk_in")).toBe("walk_in");
  });
});

describe("classifyRevenueStream", () => {
  it("classifies recognized types", () => {
    expect(classifyRevenueStream("provider_earnings")).toBe("recognized");
    expect(classifyRevenueStream("tip")).toBe("recognized");
    expect(isRecognizedRevenueType("travel_fee")).toBe(true);
  });

  it("classifies liability types as non-recognized", () => {
    expect(classifyRevenueStream("gift_card_sale")).toBe("liability");
    expect(classifyRevenueStream("membership_sale")).toBe("liability");
    expect(classifyRevenueStream("wallet_topup")).toBe("liability");
    expect(isLiabilityRevenueType("membership_sale")).toBe(true);
    expect(isRecognizedRevenueType("membership_sale")).toBe(false);
  });

  it("classifies contra and platform types", () => {
    expect(classifyRevenueStream("membership_discount")).toBe("contra");
    expect(classifyRevenueStream("provider_subscription_payment")).toBe("platform");
  });
});

describe("computeBookingChannelBreakdown", () => {
  it("reconciles channel revenue to total recognized booking revenue", () => {
    const bookings = [
      { id: "b1", booking_source: "online" },
      { id: "b2", booking_source: "walk_in" },
      { id: "b3", booking_source: null },
    ];
    const recognizedRevenueByBookingId = new Map([
      ["b1", 100],
      ["b2", 50],
      ["b3", 25],
    ]);

    const breakdown = computeBookingChannelBreakdown({ bookings, recognizedRevenueByBookingId });
    const channelRevenueSum = breakdown.reduce((s, r) => s + r.recognized_revenue, 0);
    const totalRecognized = [...recognizedRevenueByBookingId.values()].reduce((s, v) => s + v, 0);

    expect(channelRevenueSum).toBe(totalRecognized);
    expect(breakdown.find((r) => r.channel === "online")?.count).toBe(2);
    expect(breakdown.find((r) => r.channel === "walk_in")?.recognized_revenue).toBe(50);
  });

  it("attributes walk-in add-on revenue to the booking channel", () => {
    const bookings = [{ id: "b-walk", booking_source: "walk_in" }];
    const recognizedRevenueByBookingId = new Map([
      ["b-walk", 80], // service + walk_in_additional_charge combined
    ]);

    const breakdown = computeBookingChannelBreakdown({ bookings, recognizedRevenueByBookingId });
    expect(breakdown[0].channel).toBe("walk_in");
    expect(breakdown[0].recognized_revenue).toBe(80);
  });
});

describe("computeOrderSourceBreakdown", () => {
  it("segments online vs walk_in retail", () => {
    const result = computeOrderSourceBreakdown({
      orders: [
        { order_source: "online", units: 2, revenue: 200 },
        { order_source: "walk_in", units: 1, revenue: 50 },
        { order_source: "appointment", units: 5, revenue: 500 },
      ],
    });
    expect(result.online.units).toBe(2);
    expect(result.online.revenue).toBe(200);
    expect(result.walk_in.units).toBe(1);
    expect(result.walk_in.revenue).toBe(50);
  });
});

describe("CHANNEL_BASIS_NOTE", () => {
  it("is a non-empty string", () => {
    expect(CHANNEL_BASIS_NOTE.length).toBeGreaterThan(20);
  });
});
