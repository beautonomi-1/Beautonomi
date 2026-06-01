import { describe, expect, it } from "vitest";
import {
  isCancelledMembershipBadgeStale,
  shouldShowCancelledMembershipBadge,
  MEMBERSHIP_CANCELLED_BADGE_TTL_DAYS,
} from "./cancelledMembershipBadge";

describe("cancelledMembershipBadge", () => {
  const now = new Date("2026-05-27T12:00:00.000Z").getTime();

  it("shows cancelled badge within TTL", () => {
    const cancelledAt = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      shouldShowCancelledMembershipBadge({ status: "cancelled", cancelled_at: cancelledAt, nowMs: now }),
    ).toBe(true);
  });

  it("hides cancelled badge after TTL", () => {
    const cancelledAt = new Date(
      now - (MEMBERSHIP_CANCELLED_BADGE_TTL_DAYS + 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isCancelledMembershipBadgeStale(cancelledAt, now)).toBe(true);
    expect(
      shouldShowCancelledMembershipBadge({ status: "cancelled", cancelled_at: cancelledAt, nowMs: now }),
    ).toBe(false);
  });

  it("hides cancelled badge when there is no cancellation anchor", () => {
    // §Provider-launch (audit 2026-06): legacy / manually-edited rows with
    // `status === "cancelled"` but no `cancelled_at` must NOT show the pill
    // in perpetuity.
    expect(
      shouldShowCancelledMembershipBadge({ status: "cancelled", cancelled_at: null, nowMs: now }),
    ).toBe(false);
    expect(
      shouldShowCancelledMembershipBadge({ status: "cancelled", cancelled_at: undefined, nowMs: now }),
    ).toBe(false);
  });
});
