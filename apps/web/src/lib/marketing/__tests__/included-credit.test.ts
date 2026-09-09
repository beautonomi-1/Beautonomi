import { describe, expect, it } from "vitest";
import { resolveIncludedMonthlyCreditZar } from "../included-credit";

describe("resolveIncludedMonthlyCreditZar", () => {
  it("prefers marketing credit over ads credit", () => {
    const grant = resolveIncludedMonthlyCreditZar({
      marketing_campaigns: { included_marketing_credit_zar_per_month: 25 },
      platform_ads: { enabled: true, included_credit_zar_per_month: 50 },
    });
    expect(grant).toBe(25);
  });

  it("grants Growth ads credit without use_platform_credentials", () => {
    const grant = resolveIncludedMonthlyCreditZar({
      marketing_campaigns: { use_platform_credentials: false },
      platform_ads: { enabled: true, included_credit_zar_per_month: 50 },
    });
    expect(grant).toBe(50);
  });

  it("returns 0 for Scale with no included credit", () => {
    const grant = resolveIncludedMonthlyCreditZar({
      platform_ads: { enabled: true, included_credit_zar_per_month: 0 },
      marketing_campaigns: { included_marketing_credit_zar_per_month: 0 },
    });
    expect(grant).toBe(0);
  });

  it("returns 0 for Starter even when stale ads credit is present", () => {
    const grant = resolveIncludedMonthlyCreditZar({
      platform_ads: { enabled: false, included_credit_zar_per_month: 100 },
      marketing_campaigns: { enabled: false },
    });
    expect(grant).toBe(0);
  });
});
