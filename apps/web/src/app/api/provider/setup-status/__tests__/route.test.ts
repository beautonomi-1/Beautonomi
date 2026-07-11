import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAuthInApi = vi.fn();
const mockResolveTenant = vi.fn();
const mockGetPlatformSalesDefaults = vi.fn();
const mockLocationHasOperatingHours = vi.fn();
const mockCreateClient = vi.fn();
const mockIsFeatureEnabledServer = vi.fn();
const mockCheckMultipleFeaturesServer = vi.fn();
const mockLoadProviderVerificationState = vi.fn();
const mockResolveVerificationPolicy = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireAuthInApi: (...args: unknown[]) => mockRequireAuthInApi(...args),
  successResponse: (data: unknown, status = 200) =>
    Response.json({ data, error: null }, { status }),
  handleApiError: (error: unknown, fallback: string) =>
    Response.json(
      { data: null, error: { message: error instanceof Error ? error.message : fallback } },
      { status: 500 },
    ),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenant(...args),
}));

vi.mock("@/lib/platform-sales-settings", () => ({
  getPlatformSalesDefaults: (...args: unknown[]) => mockGetPlatformSalesDefaults(...args),
}));

vi.mock("@/lib/provider/location-operating-hours", () => ({
  locationHasOperatingHours: (...args: unknown[]) => mockLocationHasOperatingHours(...args),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

vi.mock("@/lib/server/feature-flags", () => ({
  isFeatureEnabledServer: (...args: unknown[]) => mockIsFeatureEnabledServer(...args),
  checkMultipleFeaturesServer: (...args: unknown[]) => mockCheckMultipleFeaturesServer(...args),
}));

vi.mock("@/lib/verification/provider-verification-state", () => ({
  loadProviderVerificationState: (...args: unknown[]) =>
    mockLoadProviderVerificationState(...args),
}));

vi.mock("@/lib/verification/verification-policy", () => ({
  resolveVerificationPolicy: (...args: unknown[]) => mockResolveVerificationPolicy(...args),
}));

type Fixture = {
  provider: Record<string, unknown> | null;
  accountUser: Record<string, unknown> | null;
  providerKyc: Record<string, unknown> | null;
  locations: Array<Record<string, unknown>>;
  servicesCount: number;
  yocoCount: number;
  payoutCount: number;
  travelFeeCount: number;
  zoneSelectionCount: number;
  userProfile: Record<string, unknown> | null;
};

function makeBuilder(result: { data?: unknown; count?: number | null; error?: unknown }) {
  const b: any = {};
  const chain = (..._args: unknown[]) => b;
  b.select = chain;
  b.eq = chain;
  b.neq = chain;
  b.is = chain;
  b.not = chain;
  b.in = chain;
  b.order = chain;
  b.limit = chain;
  b.single = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  b.maybeSingle = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  // For terminal awaits (e.g. when there's no `.single()` call) Postgrest builders are thenable.
  b.then = (resolve: (v: unknown) => void) =>
    resolve({
      data: Array.isArray(result.data) ? result.data : result.data == null ? [] : [result.data],
      count: result.count ?? null,
      error: result.error ?? null,
    });
  return b;
}

function makeSupabase(fixture: Fixture) {
  let providerCallIndex = 0;
  return {
    from(table: string) {
      switch (table) {
        case "providers": {
          providerCallIndex += 1;
          if (providerCallIndex === 1) {
            // .order().eq().select(): list of providers by user_id
            return makeBuilder({
              data: fixture.provider ? [{ id: fixture.provider.id, tenant_id: "tenant-1", status: "active" }] : [],
            });
          }
          // second call uses .single() with all selected fields
          return makeBuilder({ data: fixture.provider });
        }
        case "provider_staff":
          return makeBuilder({ data: [] });
        case "users":
          return makeBuilder({ data: fixture.accountUser });
        case "provider_verification_status":
          return makeBuilder({ data: fixture.providerKyc });
        case "provider_locations":
          return makeBuilder({ data: fixture.locations });
        case "offerings":
          return makeBuilder({ count: fixture.servicesCount, data: [] });
        case "provider_yoco_integrations":
          return makeBuilder({ count: fixture.yocoCount, data: [] });
        case "provider_travel_fee_settings":
          return makeBuilder({ count: fixture.travelFeeCount, data: [] });
        case "provider_zone_selections":
          return makeBuilder({ count: fixture.zoneSelectionCount, data: [] });
        case "provider_payout_accounts":
          return makeBuilder({ count: fixture.payoutCount, data: [] });
        case "user_profiles":
          return makeBuilder({ data: fixture.userProfile });
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    },
  };
}

function emptyFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    provider: {
      id: "provider-1",
      status: "active",
      business_name: "Beauty Co",
      description: "We do amazing work for clients",
      business_type: "freelancer",
      thumbnail_url: "https://example.com/logo.png",
      avatar_url: null,
      gallery: [],
      accept_cash: false,
      accept_card: false,
      accept_online: false,
      phone: "+27000000000",
      email: "shop@example.com",
      is_verified: false,
      tenant_id: "tenant-1",
      payee_kind: "individual",
    },
    accountUser: { identity_verified: false, identity_verification_status: null, email: "u@example.com", phone: "+27" },
    providerKyc: null,
    locations: [
      {
        id: "loc-1",
        is_active: true,
        address_line1: "123 Main",
        city: "Cape Town",
        working_hours: [{ day: "mon" }],
      },
    ],
    servicesCount: 1,
    yocoCount: 0,
    payoutCount: 1,
    travelFeeCount: 0,
    zoneSelectionCount: 0,
    userProfile: {
      about: "I am a freelancer offering bespoke services",
      languages: ["en"],
      interests: ["hair"],
    },
    ...overrides,
  };
}

async function callRoute(fixture: Fixture) {
  mockCreateClient.mockReturnValue(makeSupabase(fixture));
  mockRequireAuthInApi.mockResolvedValue({ user: { id: "user-1", email: "u@example.com" } });
  mockResolveTenant.mockResolvedValue("tenant-1");
  mockGetPlatformSalesDefaults.mockResolvedValue({ gift_cards_enabled: false });
  mockLocationHasOperatingHours.mockImplementation((hours: unknown) =>
    Array.isArray(hours) ? hours.length > 0 : !!hours,
  );
  mockIsFeatureEnabledServer.mockResolvedValue(true);
  mockCheckMultipleFeaturesServer.mockResolvedValue({});
  const { GET } = await import("../route");
  const req = new NextRequest("https://app.example.com/api/provider/setup-status");
  const res = await GET(req);
  return res.json();
}

describe("GET /api/provider/setup-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockLoadProviderVerificationState.mockResolvedValue(null);
    mockResolveVerificationPolicy.mockResolvedValue({
      requiredForProviders: true,
      kybEnabled: false,
      kybRequiredForBusiness: false,
    });
  });

  it("does not auto-complete payment-methods when no accept_* flag is true", async () => {
    const res = await callRoute(emptyFixture());
    const paymentMethods = res.data.steps.find((s: any) => s.id === "payment-methods");
    expect(paymentMethods.completed).toBe(false);
    expect(res.data.missing_steps).toContain("payment-methods");
  });

  it("marks payment-methods complete once a provider opts into a method", async () => {
    const fixture = emptyFixture();
    (fixture.provider as any).accept_cash = true;
    const res = await callRoute(fixture);
    const paymentMethods = res.data.steps.find((s: any) => s.id === "payment-methods");
    expect(paymentMethods.completed).toBe(true);
  });

  it("treats Sumsub approved KYC as identity-verified", async () => {
    const res = await callRoute(
      emptyFixture({
        accountUser: { identity_verified: false, identity_verification_status: "in_progress" },
        providerKyc: { status: "approved" },
      }),
    );
    const idStep = res.data.steps.find((s: any) => s.id === "identity-verification");
    expect(idStep.completed).toBe(true);
  });

  it("treats provider verified badge as identity-verified fallback", async () => {
    const fixture = emptyFixture();
    (fixture.provider as any).is_verified = true;
    const res = await callRoute(fixture);
    const idStep = res.data.steps.find((s: any) => s.id === "identity-verification");
    expect(idStep.completed).toBe(true);
  });

  it("returns native_route for every emitted step", async () => {
    const res = await callRoute(emptyFixture());
    for (const step of res.data.steps) {
      expect(step.native_route).toBeTypeOf("string");
      expect(step.native_route?.startsWith("/(app)/")).toBe(true);
    }
  });

  it("excludes personal-profile for non-freelancer businesses", async () => {
    const fixture = emptyFixture();
    (fixture.provider as any).business_type = "salon";
    const res = await callRoute(fixture);
    const personal = res.data.steps.find((s: any) => s.id === "personal-profile");
    expect(personal).toBeUndefined();
  });

  // §provider-launch (2026-06): Paystack Terminal is feature-gated and must not
  // appear in onboarding (the hub / get-started), even when the flag is enabled.
  it("never includes Paystack Terminal steps in onboarding (even when enabled)", async () => {
    mockIsFeatureEnabledServer.mockResolvedValue(true);
    const res = await callRoute(emptyFixture());
    const ids = res.data.steps.map((s: any) => s.id);
    expect(ids).not.toContain("paystack-terminal");
    expect(ids).not.toContain("paystack-terminal-assets");
  });

  it("keeps identity incomplete when business KYB is required but only person KYC is approved", async () => {
    mockLoadProviderVerificationState.mockResolvedValue({
      isComplete: false,
      plan: {
        required_steps: ["person_kyc", "business_kyb"],
        effective_summary: "Registered business: Person identity (KYC); Business verification (KYB) — required",
      },
    });
    const fixture = emptyFixture({
      providerKyc: { status: "approved" },
      accountUser: { identity_verified: true, identity_verification_status: "approved" },
    });
    (fixture.provider as any).payee_kind = "business";
    const res = await callRoute(fixture);
    const idStep = res.data.steps.find((s: any) => s.id === "identity-verification");
    expect(idStep.completed).toBe(false);
    expect(idStep.title).toBe("Identity & business verification");
  });

  it("marks identity complete when the full verification plan is complete", async () => {
    mockLoadProviderVerificationState.mockResolvedValue({
      isComplete: true,
      plan: {
        required_steps: ["person_kyc", "business_kyb"],
        effective_summary: "Registered business: Person identity (KYC); Business verification (KYB) — required",
      },
    });
    const res = await callRoute(emptyFixture());
    const idStep = res.data.steps.find((s: any) => s.id === "identity-verification");
    expect(idStep.completed).toBe(true);
  });

  it("uses legacy person approval when business verification is not required", async () => {
    mockLoadProviderVerificationState.mockResolvedValue({
      isComplete: false,
      plan: { required_steps: ["person_kyc"], effective_summary: "Individual provider: Person identity (KYC)" },
    });
    const res = await callRoute(
      emptyFixture({
        accountUser: { identity_verified: true, identity_verification_status: "approved" },
      }),
    );
    const idStep = res.data.steps.find((s: any) => s.id === "identity-verification");
    expect(idStep.completed).toBe(true);
  });

  it("requires manual business review completion when plan includes manual_business_review", async () => {
    mockLoadProviderVerificationState.mockResolvedValue({
      isComplete: false,
      plan: {
        required_steps: ["person_kyc", "manual_business_review"],
        effective_summary: "Registered business: Person identity (KYC); Manual business document review",
      },
    });
    const fixture = emptyFixture({
      accountUser: { identity_verified: true, identity_verification_status: "approved" },
    });
    (fixture.provider as any).payee_kind = "business";
    const res = await callRoute(fixture);
    const idStep = res.data.steps.find((s: any) => s.id === "identity-verification");
    expect(idStep.completed).toBe(false);
  });

  it("does not use legacy person approval for business payee when verification state fails to load", async () => {
    mockLoadProviderVerificationState.mockResolvedValue(null);
    const fixture = emptyFixture({
      accountUser: { identity_verified: true, identity_verification_status: "approved" },
    });
    (fixture.provider as any).payee_kind = "business";
    const res = await callRoute(fixture);
    const idStep = res.data.steps.find((s: any) => s.id === "identity-verification");
    expect(idStep.completed).toBe(false);
  });
});
