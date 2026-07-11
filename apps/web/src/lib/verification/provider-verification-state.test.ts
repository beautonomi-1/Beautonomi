import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVerificationStatus = vi.fn();
const mockGetBusinessVerificationStatus = vi.fn();
const mockResolveVerificationPolicy = vi.fn();
const mockResolveProviderVerificationPlan = vi.fn();
const mockIsVerificationPlanComplete = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "providers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    user_id: "owner-1",
                    tenant_id: "tenant-1",
                    payee_kind: "business",
                    kyb_verification_status: null,
                    is_verified: false,
                    registered_business_name: "Acme",
                    business_registration_number: null,
                    business_registration_country: "ZA",
                    verified_person_role: "owner",
                    business_type: "salon",
                  },
                }),
            }),
          }),
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { identity_verified: true, identity_verification_status: "approved" },
                }),
            }),
          }),
        };
      }
      if (table === "provider_verification_status") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { status: "approved" } }),
            }),
          }),
        };
      }
      if (table === "user_verifications") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

vi.mock("@/lib/identity-verification/identity-verification-service", () => ({
  getVerificationStatus: (...args: unknown[]) => mockGetVerificationStatus(...args),
  getBusinessVerificationStatus: (...args: unknown[]) => mockGetBusinessVerificationStatus(...args),
}));

vi.mock("@/lib/verification/verification-policy", () => ({
  resolveVerificationPolicy: (...args: unknown[]) => mockResolveVerificationPolicy(...args),
}));

vi.mock("@/lib/verification/verification-plan", () => ({
  resolveProviderVerificationPlan: (...args: unknown[]) => mockResolveProviderVerificationPlan(...args),
  isVerificationPlanComplete: (...args: unknown[]) => mockIsVerificationPlanComplete(...args),
}));

describe("loadProviderVerificationState legacy person KYC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockResolveVerificationPolicy.mockResolvedValue({});
    mockResolveProviderVerificationPlan.mockReturnValue({
      required_steps: ["person_kyc", "business_kyb"],
      kybEnabled: true,
    });
    mockGetBusinessVerificationStatus.mockResolvedValue("not_started");
    mockIsVerificationPlanComplete.mockImplementation((_plan, input) => {
      return input.personKycStatus === "approved" && input.businessKybStatus === "approved";
    });
  });

  it("treats legacy person approval as approved when no Didit user session exists", async () => {
    mockGetVerificationStatus.mockResolvedValue("not_started");

    const { loadProviderVerificationState } = await import("./provider-verification-state");
    const state = await loadProviderVerificationState("provider-1");

    expect(state?.personKycStatus).toBe("approved");
    expect(state?.isComplete).toBe(false);
    expect(state?.businessKybStatus).toBe("not_started");
  });

  it("does not invent KYB approval from legacy person badges", async () => {
    mockGetVerificationStatus.mockResolvedValue("not_started");

    const { loadProviderVerificationState } = await import("./provider-verification-state");
    const state = await loadProviderVerificationState("provider-1");

    expect(state?.businessKybStatus).toBe("not_started");
    expect(state?.isComplete).toBe(false);
  });
});
