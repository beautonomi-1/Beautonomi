import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/identity-verification/provider/didit-provider", () => ({
  getEffectiveDiditWorkflowId: vi.fn(() => "kyc-workflow-id"),
  getEffectiveDiditKybWorkflowId: vi.fn(() => "kyb-workflow-id"),
  kybEnvPresent: vi.fn(() => true),
}));

import { kybEnvPresent } from "@/lib/identity-verification/provider/didit-provider";
import {
  isVerificationPlanComplete,
  resolveProviderVerificationPlan,
  verificationPlanProgress,
} from "@/lib/verification/verification-plan";
import type { VerificationPolicy } from "@/lib/verification/verification-policy";

function basePolicy(overrides: Partial<VerificationPolicy> = {}): VerificationPolicy {
  return {
    diditEnabled: true,
    sumsubEnabled: false,
    manualEnabled: true,
    mode: "both",
    requiredForProviders: true,
    requiredForPayouts: true,
    requiredForCustomers: false,
    crossValidate: true,
    minAge: 18,
    dedupeEnabled: true,
    kybEnabled: false,
    kybRequiredForBusiness: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(kybEnvPresent).mockReturnValue(true);
});

describe("resolveProviderVerificationPlan", () => {
  it("KYC only — individual and business get person_kyc only", () => {
    const policy = basePolicy({ kybEnabled: false });
    const individual = resolveProviderVerificationPlan(policy, "individual");
    const business = resolveProviderVerificationPlan(policy, "business");
    expect(individual.required_steps).toEqual(["person_kyc"]);
    expect(business.required_steps).toEqual(["person_kyc"]);
    expect(business.optional_steps).toEqual([]);
  });

  it("KYC + KYB required — business providers need both steps", () => {
    const policy = basePolicy({ kybEnabled: true, kybRequiredForBusiness: true });
    const plan = resolveProviderVerificationPlan(policy, "business");
    expect(plan.required_steps).toEqual(["person_kyc", "business_kyb"]);
    expect(plan.kybEnabled).toBe(true);
  });

  it("KYC + KYB optional — business_kyb in optional_steps", () => {
    const policy = basePolicy({ kybEnabled: true, kybRequiredForBusiness: false });
    const plan = resolveProviderVerificationPlan(policy, "business");
    expect(plan.required_steps).toEqual(["person_kyc"]);
    expect(plan.optional_steps).toEqual(["business_kyb"]);
  });

  it("manual only when Didit off", () => {
    const policy = basePolicy({ diditEnabled: false, manualEnabled: true });
    const plan = resolveProviderVerificationPlan(policy, "individual");
    expect(plan.required_steps).toEqual(["manual_upload"]);
    expect(plan.mode).toBe("manual");
  });

  it("unsupported KYB country swaps to manual_business_review", () => {
    const policy = basePolicy({ kybEnabled: true, kybRequiredForBusiness: true });
    const plan = resolveProviderVerificationPlan(policy, "business", {
      registrationCountry: "XX",
    });
    expect(plan.required_steps).toEqual(["person_kyc", "manual_business_review"]);
    expect(plan.kyb_country_unsupported).toBe(true);
  });

  it("supported KYB country keeps business_kyb", () => {
    const policy = basePolicy({ kybEnabled: true, kybRequiredForBusiness: true });
    const plan = resolveProviderVerificationPlan(policy, "business", {
      registrationCountry: "ZA",
    });
    expect(plan.required_steps).toEqual(["person_kyc", "business_kyb"]);
    expect(plan.kyb_country_unsupported).toBe(false);
  });
});

describe("isVerificationPlanComplete", () => {
  it("individual KYC-only plan complete when person approved", () => {
    const plan = resolveProviderVerificationPlan(basePolicy(), "individual");
    expect(
      isVerificationPlanComplete(plan, {
        personKycStatus: "approved",
        businessKybStatus: "not_required",
      }),
    ).toBe(true);
  });

  it("business KYB required — needs both approved", () => {
    const plan = resolveProviderVerificationPlan(
      basePolicy({ kybEnabled: true, kybRequiredForBusiness: true }),
      "business",
    );
    expect(
      isVerificationPlanComplete(plan, {
        personKycStatus: "approved",
        businessKybStatus: "not_started",
      }),
    ).toBe(false);
    expect(
      isVerificationPlanComplete(plan, {
        personKycStatus: "approved",
        businessKybStatus: "approved",
      }),
    ).toBe(true);
  });
});

describe("verificationPlanProgress", () => {
  it("reports step counts", () => {
    const plan = resolveProviderVerificationPlan(
      basePolicy({ kybEnabled: true, kybRequiredForBusiness: true }),
      "business",
    );
    expect(
      verificationPlanProgress(plan, {
        personKycStatus: "approved",
        businessKybStatus: "not_started",
      }),
    ).toEqual({ completed: 1, total: 2 });
  });
});
