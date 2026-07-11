import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockLoadProviderVerificationState = vi.fn();
const mockResolveVerificationPolicy = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  successResponse: (data: unknown, status = 200) =>
    Response.json({ data, error: null }, { status }),
  errorResponse: (message: string, code: string, status: number) =>
    Response.json({ data: null, error: { message, code } }, { status }),
  handleApiError: (error: unknown, fallback: string) =>
    Response.json(
      { data: null, error: { message: error instanceof Error ? error.message : fallback } },
      { status: 500 },
    ),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.order = self;
      chain.limit = self;
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      if (table === "providers") {
        chain.maybeSingle = vi.fn().mockResolvedValue({
          data: { id: "provider-1", user_id: "user-1", tenant_id: "tenant-1", is_verified: false },
        });
      }
      if (table === "provider_verification_status") {
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: { status: "approved" } });
      }
      if (table === "users") {
        chain.maybeSingle = vi.fn().mockResolvedValue({
          data: { identity_verified: true, identity_verification_status: "approved" },
        });
      }
      return chain;
    },
  }),
}));

vi.mock("@/lib/verification/verification-policy", () => ({
  resolveVerificationPolicy: (...args: unknown[]) => mockResolveVerificationPolicy(...args),
}));

vi.mock("@/lib/verification/provider-verification-state", () => ({
  loadProviderVerificationState: (...args: unknown[]) => mockLoadProviderVerificationState(...args),
}));

describe("GET /api/provider/verification/status effective status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1", role: "provider_owner" } });
    mockResolveVerificationPolicy.mockResolvedValue({
      diditEnabled: true,
      sumsubEnabled: false,
      manualEnabled: true,
      requiredForProviders: true,
      requiredForPayouts: true,
    });
  });

  it("returns in_progress when person KYC is approved but business KYB is still required", async () => {
    mockLoadProviderVerificationState.mockResolvedValue({
      isComplete: false,
      personKycStatus: "approved",
      businessKybStatus: "not_started",
      manualStatus: null,
      entity: { payee_kind: "business" },
      plan: {
        payeeKind: "business",
        kybEnabled: true,
        kybRequiredForBusiness: true,
        required_steps: ["person_kyc", "business_kyb"],
        optional_steps: [],
        effective_summary: "Registered business: Person identity (KYC); Business verification (KYB) — required",
      },
    });

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/provider/verification/status?environment=production"),
    );
    const body = await res.json();

    expect(body.data.status).toBe("in_progress");
    expect(body.data.verification_plan.is_complete).toBe(false);
  });

  it("returns approved only when the full verification plan is complete", async () => {
    mockLoadProviderVerificationState.mockResolvedValue({
      isComplete: true,
      personKycStatus: "approved",
      businessKybStatus: "approved",
      manualStatus: null,
      entity: { payee_kind: "business" },
      plan: {
        payeeKind: "business",
        kybEnabled: true,
        kybRequiredForBusiness: true,
        required_steps: ["person_kyc", "business_kyb"],
        optional_steps: [],
        effective_summary: "Registered business: Person identity (KYC); Business verification (KYB) — required",
      },
    });

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/provider/verification/status?environment=production"),
    );
    const body = await res.json();

    expect(body.data.status).toBe("approved");
    expect(body.data.verification_plan.is_complete).toBe(true);
  });
});
