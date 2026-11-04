import { describe, expect, it } from "vitest";
import {
  CLEAR_PENDING_UPGRADE_FIELDS,
  normalizeBillingPeriod,
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
});
