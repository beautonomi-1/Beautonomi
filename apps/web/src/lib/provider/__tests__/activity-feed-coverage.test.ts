import { describe, expect, it } from "vitest";
import {
  PROVIDER_ACTIVITY_FEED_BOOKING_EVENT_TYPES,
  PROVIDER_ACTIVITY_FEED_LEDGER_TYPES,
  PROVIDER_ACTIVITY_FEED_NEW_CLIENT_SOURCES,
  buildActivityFeedExcludedBasis,
} from "../activity-feed-coverage";

describe("activity-feed-coverage", () => {
  it("includes subscription, ads, gift card, and membership ledger types", () => {
    expect(PROVIDER_ACTIVITY_FEED_LEDGER_TYPES).toContain("provider_subscription_payment");
    expect(PROVIDER_ACTIVITY_FEED_LEDGER_TYPES).toContain("provider_ads_payment");
    expect(PROVIDER_ACTIVITY_FEED_LEDGER_TYPES).toContain("gift_card_sale");
    expect(PROVIDER_ACTIVITY_FEED_LEDGER_TYPES).toContain("membership_sale");
  });

  it("includes reschedules and in-progress service_started events", () => {
    expect(PROVIDER_ACTIVITY_FEED_BOOKING_EVENT_TYPES).toContain("rescheduled");
    expect(PROVIDER_ACTIVITY_FEED_BOOKING_EVENT_TYPES).toContain("service_started");
  });

  it("documents explicit new-client relationship sources", () => {
    expect(PROVIDER_ACTIVITY_FEED_NEW_CLIENT_SOURCES).toContain("manual_new_customer");
    expect(PROVIDER_ACTIVITY_FEED_NEW_CLIENT_SOURCES).not.toContain("booking");
  });

  it("builds a non-empty excluded basis string", () => {
    const basis = buildActivityFeedExcludedBasis();
    expect(basis).toContain("payment");
    expect(basis).toContain("provider_on_way");
  });
});
