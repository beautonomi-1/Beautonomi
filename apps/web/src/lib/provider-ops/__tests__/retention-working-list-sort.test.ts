import { describe, expect, it } from "vitest";
import { isWeeklyBookingFrequencyFalling } from "@/lib/provider-ops/provider-booking-trend";
import {
  sortWorkingList,
  workingListSortKey,
  type EnrichedRetentionCase,
} from "@/lib/provider-ops/retention-enrich";

function caseRow(partial: Partial<EnrichedRetentionCase>): EnrichedRetentionCase {
  return {
    stage: "healthy",
    activation_badge: null,
    inactive_badge: null,
    days_since_activation: null,
    days_since_last_booking: 10,
    last_touch_at: null,
    working_priority: 99,
    on_working_list: false,
    status: "activated",
    qualifying_booking_count: 3,
    ...partial,
  } as EnrichedRetentionCase;
}

describe("retention working list — weekly frequency", () => {
  it("detects a sharp weekly drop", () => {
    expect(isWeeklyBookingFrequencyFalling({ previous7d: 4, recent7d: 2 })).toBe(true);
    expect(isWeeklyBookingFrequencyFalling({ previous7d: 1, recent7d: 0 })).toBe(false);
  });

  it("ranks falling activated salons before logo-churn winback", () => {
    const falling = caseRow({ weekly_bookings_falling: true, working_priority: 99 });
    const churnLogo = caseRow({
      status: "churned",
      working_priority: 9,
      on_working_list: true,
      churn_reason: "cancelled_expired",
    });
    expect(workingListSortKey(falling)).toBeLessThan(workingListSortKey(churnLogo));
    expect(sortWorkingList(falling, churnLogo)).toBeLessThan(0);
  });
});
