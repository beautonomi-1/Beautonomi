import { describe, expect, it } from "vitest";
import {
  ACTIONABLE_ACTIVITY_TYPES,
  ADMIN_ACTIVITY_LINKS,
  computeActivityTotalUnread,
  computeActivityTotalUnreadFromCounts,
  type AdminActivityItem,
} from "../admin-activity-feed";

function item(type: string, overrides: Partial<AdminActivityItem> = {}): AdminActivityItem {
  return {
    id: overrides.id ?? type,
    type,
    title: overrides.title ?? type,
    message: overrides.message ?? "",
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    link: overrides.link ?? "/admin",
    priority: overrides.priority ?? "high",
  };
}

describe("admin-activity-feed", () => {
  it("defines expected deep links for actionable queues", () => {
    expect(ADMIN_ACTIVITY_LINKS.disputesOpen).toBe("/admin/disputes?status=open");
    expect(ADMIN_ACTIVITY_LINKS.webhooksFailures).toBe("/admin/webhooks?tab=failures");
    expect(ADMIN_ACTIVITY_LINKS.refundsSuccess).toBe("/admin/refunds?status=success");
    expect(ADMIN_ACTIVITY_LINKS.opsTrackerStalled).toBe(
      "/admin/provider-ops/tracker?status=stalled",
    );
    expect(ADMIN_ACTIVITY_LINKS.opsLeadsNew).toBe("/admin/provider-ops/leads?stage=new");
    expect(ADMIN_ACTIVITY_LINKS.providersSuspended).toBe("/admin/providers?status=suspended");
    expect(ADMIN_ACTIVITY_LINKS.userReportsPending).toBe("/admin/user-reports?status=pending");
    expect(ADMIN_ACTIVITY_LINKS.verificationsPending).toBe(
      "/admin/identity-trust/sessions?status=pending_review#verification",
    );
  });

  it("counts only actionable activity types toward the bell badge (feed slice)", () => {
    const activities: AdminActivityItem[] = [
      item("refundable_payment", { link: ADMIN_ACTIVITY_LINKS.refundsSuccess }),
      item("dispute", { link: ADMIN_ACTIVITY_LINKS.disputesOpen }),
      item("booking"),
      item("new_provider"),
      item("high_value_transaction"),
      item("account_issue"),
      item("safety_event", { priority: "critical" }),
    ];

    expect(computeActivityTotalUnread(activities)).toBe(3);
  });

  it("sums actionable bucket counts for badge totals (safety capped to feed rows)", () => {
    expect(
      computeActivityTotalUnreadFromCounts({
        pending_payouts: 3,
        pending_verifications: 5,
        refundable_payments: 10,
        safety_in_feed: 4,
        ops_new_leads: 2,
      }),
    ).toBe(24);
    expect(
      computeActivityTotalUnreadFromCounts({
        pending_payouts: 0,
        booking: 99 as unknown as number,
      }),
    ).toBe(0);
  });

  it("treats refundable_payment as actionable (not legacy refund_request)", () => {
    expect(ACTIONABLE_ACTIVITY_TYPES.has("refundable_payment")).toBe(true);
    expect(ACTIONABLE_ACTIVITY_TYPES.has("refund_request")).toBe(false);
  });

  it("excludes informational types from actionable set", () => {
    expect(ACTIONABLE_ACTIVITY_TYPES.has("booking")).toBe(false);
    expect(ACTIONABLE_ACTIVITY_TYPES.has("new_provider")).toBe(false);
    expect(ACTIONABLE_ACTIVITY_TYPES.has("high_value_transaction")).toBe(false);
    expect(ACTIONABLE_ACTIVITY_TYPES.has("account_issue")).toBe(false);
  });
});
