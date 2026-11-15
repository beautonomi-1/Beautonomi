import { describe, expect, it } from "vitest";
import { membershipRetryAfterFailedRenewal, renewalPeriodEnd } from "../membership-renewal-retry";

describe("membershipRetryAfterFailedRenewal", () => {
  const now = new Date("2026-11-14T00:00:00.000Z");

  it("schedules the next attempt after a failed renewal and stops after the third", () => {
    const first = membershipRetryAfterFailedRenewal({
      failureCount: 0,
      status: "active",
      pastDueSince: null,
      now,
    });
    expect(first.status).toBe("past_due");
    expect(first.renewal_failure_count).toBe(1);
    expect(first.next_billing_at).toBe("2026-11-15T00:00:00.000Z");
    expect(first.auto_renew).toBeUndefined();

    const stopped = membershipRetryAfterFailedRenewal({
      failureCount: 2,
      status: "past_due",
      pastDueSince: "2026-11-01T00:00:00.000Z",
      now,
    });
    expect(stopped.renewal_failure_count).toBe(3);
    expect(stopped.next_billing_at).toBeNull();
    expect(stopped.auto_renew).toBe(false);
    expect(stopped.past_due_since).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("renewalPeriodEnd", () => {
  it("starts a lapsed membership from today and keeps the remaining days of an open one", () => {
    const now = new Date(2026, 10, 14);
    const lapsed = renewalPeriodEnd("2026-06-01T12:00:00.000Z", now);
    expect(lapsed.getFullYear()).toBe(2026);
    expect(lapsed.getMonth()).toBe(11);
    expect(lapsed.getDate()).toBe(14);

    const open = renewalPeriodEnd(new Date(2026, 11, 1).toISOString(), now);
    expect(open.getFullYear()).toBe(2027);
    expect(open.getMonth()).toBe(0);
    expect(open.getDate()).toBe(1);

    const monthEnd = renewalPeriodEnd(new Date(2026, 0, 31).toISOString(), new Date(2026, 0, 15));
    expect(monthEnd.getFullYear()).toBe(2026);
    expect(monthEnd.getMonth()).toBe(1);
    expect(monthEnd.getDate()).toBe(28);
  });
});
