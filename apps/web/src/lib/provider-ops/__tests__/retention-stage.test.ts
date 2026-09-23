import { describe, expect, it } from "vitest";
import {
  isOnWorkingList,
  retentionStage,
  workingListPriority,
} from "@/lib/provider-ops/retention-stage";

const now = new Date("2026-06-15T12:00:00Z").getTime();

function daysAgo(n: number): string {
  return new Date(now - n * 86400000).toISOString();
}

describe("retentionStage", () => {
  it("keeps activation day 3 off working list stages", () => {
    const { stage } = retentionStage(
      {
        status: "activated",
        activated_at: daysAgo(3),
        first_booking_at: null,
        last_qualifying_booking_at: null,
        qualifying_booking_count: 0,
        returned_at: null,
      },
      now,
    );
    expect(stage).toBe("activation_ok");
    const p = workingListPriority({
      stage,
      status: "activated",
      churn_reason: null,
      next_follow_up_at: null,
      at_risk_flagged_at: null,
      last_touch_at: null,
      winback_step: 0,
      nowMs: now,
    });
    expect(isOnWorkingList(p)).toBe(false);
  });

  it("puts activation day 8 on working list", () => {
    const { stage } = retentionStage(
      {
        status: "activated",
        activated_at: daysAgo(8),
        first_booking_at: null,
        last_qualifying_booking_at: null,
        qualifying_booking_count: 0,
        returned_at: null,
      },
      now,
    );
    expect(stage).toBe("activation_7d");
    const p = workingListPriority({
      stage,
      status: "activated",
      churn_reason: null,
      next_follow_up_at: null,
      at_risk_flagged_at: null,
      last_touch_at: null,
      winback_step: 0,
      nowMs: now,
    });
    expect(isOnWorkingList(p)).toBe(true);
  });

  it("classifies one-and-done at 14 days with one booking", () => {
    const first = daysAgo(14);
    const { stage } = retentionStage(
      {
        status: "activated",
        activated_at: daysAgo(30),
        first_booking_at: first,
        last_qualifying_booking_at: first,
        qualifying_booking_count: 1,
        returned_at: null,
      },
      now,
    );
    expect(stage).toBe("one_and_done");
  });

  it("excludes saved at-risk from working list priority", () => {
    const { stage } = retentionStage(
      {
        status: "activated",
        activated_at: daysAgo(60),
        first_booking_at: daysAgo(50),
        last_qualifying_booking_at: daysAgo(2),
        qualifying_booking_count: 5,
        returned_at: null,
      },
      now,
    );
    expect(stage).toBe("healthy");
    const p = workingListPriority({
      stage,
      status: "activated",
      churn_reason: null,
      next_follow_up_at: null,
      at_risk_flagged_at: daysAgo(3),
      at_risk_saved_at: daysAgo(1),
      last_touch_at: null,
      winback_step: 0,
      nowMs: now,
    });
    expect(isOnWorkingList(p)).toBe(false);
  });

  it("classifies healthy with two recent bookings", () => {
    const { stage } = retentionStage(
      {
        status: "activated",
        activated_at: daysAgo(60),
        first_booking_at: daysAgo(50),
        last_qualifying_booking_at: daysAgo(2),
        qualifying_booking_count: 5,
        returned_at: null,
      },
      now,
    );
    expect(stage).toBe("healthy");
  });
});
