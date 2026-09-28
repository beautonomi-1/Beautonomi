import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockFetchScopedSingle = vi.fn();
const mockCreateClient = vi.fn();
const mockMarkLifecycle = vi.fn();
const mockResolveVerificationPolicy = vi.fn();
const mockIsProviderVerificationApproved = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) =>
    mockResolveTenantIdWithZaFallback(...args),
}));

vi.mock("@/lib/tenant/scoped-overrides", () => ({
  fetchScopedSingle: (...args: unknown[]) => mockFetchScopedSingle(...args),
}));

vi.mock("@/lib/mapbox/geocodeProviderLocation", () => ({
  geocodeProviderLocation: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

vi.mock("@/lib/auth/effective-provider-role", () => ({
  persistJoinedProviderRole: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/tenant/market-availability", () => ({
  assertTransactionalMarketAllowedForTenantId: vi.fn().mockResolvedValue(null),
  assertTransactionalMarketAllowed: vi.fn().mockReturnValue(null),
  assertSupportedMarketAddressCountry: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/provider-ops/mark-provider-onboarding-lifecycle-complete", () => ({
  markProviderOnboardingLifecycleComplete: (...args: unknown[]) => mockMarkLifecycle(...args),
}));

vi.mock("@/lib/verification/verification-policy", () => ({
  resolveVerificationPolicy: (...args: unknown[]) => mockResolveVerificationPolicy(...args),
  isProviderVerificationApproved: (...args: unknown[]) =>
    mockIsProviderVerificationApproved(...args),
}));

vi.mock("@/lib/provider-ops/consolidate-leads-on-signup", () => ({
  consolidateLeadsOnSignup: vi.fn().mockResolvedValue({ primaryLeadId: null }),
}));

vi.mock("@/lib/provider-ops/apply-provider-signup-case-hooks", () => ({
  applyProviderSignupCaseHooks: vi.fn().mockResolvedValue(undefined),
}));

const onboardingProfileImages = {
  thumbnail_url: "https://example.com/thumbnail.jpg",
  avatar_url: "https://example.com/avatar.jpg",
};

function makeStorageMock() {
  return {
    from: vi.fn(() => ({
      upload: vi.fn(async (path: string) => ({
        data: { path: `provider-gallery/${path}` },
        error: null,
      })),
      getPublicUrl: vi.fn((path: string) => ({
        data: { publicUrl: `https://storage.example.com/${path}` },
      })),
    })),
  };
}

describe("POST /api/provider/onboarding verification hold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1", email: "owner@example.com" } },
          error: null,
        })),
      },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-1");
    mockFetchScopedSingle.mockResolvedValue({
      data: {
        settings: {
          features: { auto_approve_providers: true },
        },
      },
      source: "tenant",
    });
    mockResolveVerificationPolicy.mockResolvedValue({ requiredForProviders: true });
    mockIsProviderVerificationApproved.mockResolvedValue(false);
    mockMarkLifecycle.mockResolvedValue(undefined);
  });

  it("does not mark lifecycle complete when auto-approve is blocked by verification", async () => {
    let providerRow: Record<string, unknown> = {
      id: "provider-1",
      status: "active",
      onboarding_state: "activated",
    };

    const defaultSubscriptionMocks = {
      providerSubscriptions: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
        insert: vi.fn(async () => ({ error: null })),
      },
      subscriptionPlans: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { id: "plan-free", is_free: true, is_active: true },
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        })),
      },
    };

    const mockSupabaseAdmin = {
      storage: makeStorageMock(),
      from: vi.fn((table: string) => {
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((column: string) => ({
                maybeSingle: vi.fn(async () => {
                  if (column === "id") {
                    return { data: providerRow, error: null };
                  }
                  return { data: null, error: null };
                }),
              })),
            })),
            insert: vi.fn((payload: Record<string, unknown>) => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  providerRow = {
                    id: "provider-1",
                    status: "active",
                    onboarding_state: "activated",
                    ...payload,
                  };
                  return { data: providerRow, error: null };
                }),
              })),
            })),
            update: vi.fn((patch: Record<string, unknown>) => ({
              eq: vi.fn(async () => {
                providerRow = { ...providerRow, ...patch };
                return { error: null };
              }),
            })),
          };
        }
        if (table === "tenants") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { default_currency: "ZAR" },
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "users") {
          return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
        }
        if (table === "provider_locations") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "loc-1" }, error: null })),
              })),
            })),
          };
        }
        if (table === "provider_global_category_associations") {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        if (table === "global_categories") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [], error: null })),
            })),
          };
        }
        if (table === "provider_onboarding_drafts") {
          return { delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
        }
        if (table === "provider_onboarding_tracking") {
          return { upsert: vi.fn(async () => ({ error: null })) };
        }
        if (table === "provider_subscriptions") {
          return defaultSubscriptionMocks.providerSubscriptions;
        }
        if (table === "subscription_plans") {
          return defaultSubscriptionMocks.subscriptionPlans;
        }
        if (table === "offerings") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [], error: null })),
            })),
          };
        }
        if (table === "provider_staff") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
            insert: vi.fn(async () => ({ error: null })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: null, error: { message: "does not exist" } })),
    };
    mockCreateClient.mockReturnValue(mockSupabaseAdmin);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/onboarding", {
      method: "POST",
      body: JSON.stringify({
        business_name: "Verify Hold Salon",
        business_type: "salon",
        address: {
          line1: "1 Main",
          city: "Cape Town",
          country: "ZA",
          latitude: -33.9,
          longitude: 18.4,
        },
        global_category_ids: ["11111111-1111-4111-8111-111111111111"],
        operating_hours: {},
        services: [],
        ...onboardingProfileImages,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.auto_approved).toBe(false);
    expect(json.data.provider.status).toBe("pending_approval");
    expect(json.data.provider.onboarding_state).toBe("ready_for_activation");
    expect(String(json.data.message)).toContain("Verify your identity");
    expect(mockMarkLifecycle).not.toHaveBeenCalled();
  }, 120_000);
});
