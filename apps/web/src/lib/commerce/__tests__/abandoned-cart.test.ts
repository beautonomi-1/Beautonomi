import { describe, expect, it } from "vitest";
import {
  ABANDONED_CART_IDLE_MIN_MS,
  ABANDONED_CART_MAX_AGE_MS,
  ABANDONED_CART_MIN_GAP_MS,
  buildItemSummary,
  computeCartFingerprint,
  countsAsAbandonedCartSend,
  filterEligibleCartLines,
  groupAbandonedCartCandidates,
  hasCoveringPaidOrder,
  isCartLineInReminderWindow,
  shouldSendAbandonedCartReminder,
  type AbandonedCartLine,
  type PaidOrderCover,
} from "@/lib/commerce/abandoned-cart";
import { templateKeyToPreferenceSection } from "@/lib/notifications/customer-notification-channels";

const NOW = Date.parse("2026-01-15T12:00:00.000Z");

function line(partial: Partial<AbandonedCartLine> & Pick<AbandonedCartLine, "updated_at">): AbandonedCartLine {
  return {
    user_id: "user-1",
    provider_id: "prov-1",
    product_id: "prod-1",
    product_variant_id: null,
    quantity: 1,
    product_name: "Shampoo",
    is_active: true,
    retail_sales_enabled: true,
    track_stock_quantity: false,
    product_quantity: 10,
    variant_quantity: null,
    ...partial,
  };
}

describe("abandoned-cart eligibility", () => {
  it("excludes lines younger than 6 hours", () => {
    const updated = new Date(NOW - ABANDONED_CART_IDLE_MIN_MS + 60_000).toISOString();
    expect(isCartLineInReminderWindow(updated, NOW)).toBe(false);
  });

  it("excludes lines older than 7 days", () => {
    const updated = new Date(NOW - ABANDONED_CART_MAX_AGE_MS - 60_000).toISOString();
    expect(isCartLineInReminderWindow(updated, NOW)).toBe(false);
  });

  it("includes lines in the idle window", () => {
    const updated = new Date(NOW - ABANDONED_CART_IDLE_MIN_MS - 60_000).toISOString();
    expect(isCartLineInReminderWindow(updated, NOW)).toBe(true);
  });

  it("excludes out-of-stock lines when track_stock_quantity is true", () => {
    const updated = new Date(NOW - 8 * 60 * 60 * 1000).toISOString();
    const rows = filterEligibleCartLines(
      [
        line({
          updated_at: updated,
          track_stock_quantity: true,
          product_quantity: 0,
          quantity: 1,
        }),
      ],
      [],
      NOW,
    );
    expect(rows).toHaveLength(0);
  });

  it("excludes lines covered by a paid order after cart update", () => {
    const updated = new Date(NOW - 8 * 60 * 60 * 1000).toISOString();
    const cartLine = line({ updated_at: updated });
    const covers: PaidOrderCover[] = [
      {
        customer_id: "user-1",
        product_id: "prod-1",
        product_variant_id: null,
        payment_status: "paid",
        paid_at: updated,
        created_at: updated,
      },
    ];
    expect(hasCoveringPaidOrder(cartLine, covers)).toBe(true);
    expect(filterEligibleCartLines([cartLine], covers, NOW)).toHaveLength(0);
  });

  it("changes fingerprint when quantity changes", () => {
    const a = computeCartFingerprint([line({ updated_at: "2026-01-10T00:00:00.000Z", quantity: 1 })]);
    const b = computeCartFingerprint([line({ updated_at: "2026-01-10T00:00:00.000Z", quantity: 2 })]);
    expect(a).not.toBe(b);
  });
});

describe("abandoned-cart send cap", () => {
  it("blocks a third send", () => {
    expect(
      shouldSendAbandonedCartReminder({ send_count: 2, last_sent_at: null }, NOW),
    ).toBe(false);
  });

  it("blocks second send before 24 hours", () => {
    const last = new Date(NOW - ABANDONED_CART_MIN_GAP_MS + 60_000).toISOString();
    expect(shouldSendAbandonedCartReminder({ send_count: 1, last_sent_at: last }, NOW)).toBe(
      false,
    );
  });

  it("allows second send after 24 hours", () => {
    const last = new Date(NOW - ABANDONED_CART_MIN_GAP_MS - 60_000).toISOString();
    expect(shouldSendAbandonedCartReminder({ send_count: 1, last_sent_at: last }, NOW)).toBe(true);
  });
});

describe("abandoned-cart notification classification", () => {
  it("maps abandoned_cart to inspiration_and_offers", () => {
    expect(templateKeyToPreferenceSection("abandoned_cart")).toBe("inspiration_and_offers");
  });

  it("maps abandoned_cart_reminder to reminders", () => {
    expect(templateKeyToPreferenceSection("abandoned_cart_reminder")).toBe("reminders");
  });
});

describe("countsAsAbandonedCartSend", () => {
  it("returns false for suppressed and failed sends", () => {
    expect(countsAsAbandonedCartSend({ success: true, notification_id: "suppressed-preferences" })).toBe(
      false,
    );
    expect(countsAsAbandonedCartSend({ success: true, notification_id: "suppressed-quiet-hours" })).toBe(
      false,
    );
    expect(countsAsAbandonedCartSend({ success: false })).toBe(false);
  });

  it("returns true when a channel proceeded", () => {
    expect(countsAsAbandonedCartSend({ success: true, notification_id: "abc-123" })).toBe(true);
  });
});

describe("groupAbandonedCartCandidates", () => {
  it("builds item summary from first product and count", () => {
    const updated = new Date(NOW - 8 * 60 * 60 * 1000).toISOString();
    const candidates = groupAbandonedCartCandidates(
      [
        line({ updated_at: updated, product_name: "Serum", quantity: 1 }),
        line({
          updated_at: updated,
          product_id: "prod-2",
          product_name: "Oil",
          quantity: 2,
        }),
      ],
      [],
      NOW,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.itemSummary).toBe(buildItemSummary("Serum", 3));
  });
});
