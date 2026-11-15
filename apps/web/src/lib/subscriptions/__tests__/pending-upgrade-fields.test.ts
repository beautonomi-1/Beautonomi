import { describe, expect, it } from "vitest";
import {
  CLEAR_PENDING_UPGRADE_FIELDS,
  normalizeBillingPeriod,
  pendingUpgradeIntentPatch,
  stalePendingUpgradePatch,
} from "@/lib/subscriptions/pending-upgrade-fields";

describe("pending-upgrade-fields", () => {
  it("CLEAR_PENDING_UPGRADE_FIELDS nulls all intent columns", () => {
    expect(CLEAR_PENDING_UPGRADE_FIELDS).toEqual({
      pending_upgrade_plan_id: null,
      pending_upgrade_billing_period: null,
      pending_upgrade_set_at: null,
    });
  });

  it("normalizeBillingPeriod accepts monthly and yearly only", () => {
    expect(normalizeBillingPeriod("monthly")).toBe("monthly");
    expect(normalizeBillingPeriod("yearly")).toBe("yearly");
    expect(normalizeBillingPeriod("weekly")).toBeNull();
    expect(normalizeBillingPeriod(null)).toBeNull();
  });

  it("clears a stale upgrade and keeps a past-due grace date", () => {
    const now = new Date("2026-11-14T08:00:00.000Z");
    expect(stalePendingUpgradePatch({ status: "active", now })).toEqual({
      ...CLEAR_PENDING_UPGRADE_FIELDS,
      updated_at: now.toISOString(),
    });
    expect(stalePendingUpgradePatch({ status: "past_due", now })).toEqual({
      ...CLEAR_PENDING_UPGRADE_FIELDS,
    });
  });

  it("saves an upgrade intent and keeps a past-due grace date", () => {
    const now = new Date("2026-11-14T08:00:00.000Z");
    expect(
      pendingUpgradeIntentPatch({
        planId: "plan-1",
        billingPeriod: "monthly",
        status: "active",
        now,
      }),
    ).toEqual({
      pending_upgrade_plan_id: "plan-1",
      pending_upgrade_billing_period: "monthly",
      pending_upgrade_set_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
    expect(
      pendingUpgradeIntentPatch({
        planId: "plan-1",
        billingPeriod: "yearly",
        status: "past_due",
        now,
      }),
    ).toEqual({
      pending_upgrade_plan_id: "plan-1",
      pending_upgrade_billing_period: "yearly",
      pending_upgrade_set_at: now.toISOString(),
    });
  });
});
