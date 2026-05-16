import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockFetchScopedSingle = vi.fn();
const mockInitializePaystackTransactionWithPlan = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockCreateClient = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) =>
    mockResolveTenantIdWithZaFallback(...args),
}));

vi.mock("@/lib/tenant/scoped-overrides", () => ({
  fetchScopedSingle: (...args: unknown[]) => mockFetchScopedSingle(...args),
}));

vi.mock("@/lib/payments/paystack-server", () => ({
  initializePaystackTransactionWithPlan: (...args: unknown[]) =>
    mockInitializePaystackTransactionWithPlan(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

describe("POST /api/provider/subscriptions/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses tenant-scoped plan lookup and tenant default currency", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-1", role: "provider_owner" },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-uk");
    mockGetSupabaseServer.mockResolvedValue({});

    mockFetchScopedSingle
      .mockResolvedValueOnce({
        data: { id: "provider-1", user_id: "user-1", email: "owner@example.com" },
        source: "tenant",
      })
      .mockResolvedValueOnce({
        data: {
          id: "plan-1",
          paystack_plan_code_monthly: "PLN_MONTHLY_UK",
          paystack_plan_code_yearly: "PLN_YEARLY_UK",
          subscription_plan_id: "subscription-plan-1",
        },
        source: "tenant",
      });

    const mockSupabaseAdmin = {
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { email: "owner@example.com", full_name: "Owner" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "tenants") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { default_currency: "GBP" },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockCreateClient.mockReturnValue(mockSupabaseAdmin);
    mockInitializePaystackTransactionWithPlan.mockResolvedValue({
      data: {
        authorization_url: "https://paystack.test/auth",
        access_code: "acc_123",
        reference: "ref_123",
      },
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/subscriptions/create", {
      method: "POST",
      body: JSON.stringify({
        plan_id: "11111111-1111-4111-8111-111111111111",
        billing_period: "monthly",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body?.data?.authorization_url).toBe("https://paystack.test/auth");

    expect(mockFetchScopedSingle).toHaveBeenCalledWith(
      expect.objectContaining({
        table: "pricing_plans",
        tenantId: "tenant-uk",
      }),
    );
    expect(mockInitializePaystackTransactionWithPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "GBP",
        tenantId: "tenant-uk",
      }),
    );
  });

  it("does not block paid checkout when existing active subscription is free tier", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-2", role: "provider_owner" },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockGetSupabaseServer.mockResolvedValue({});

    mockFetchScopedSingle
      .mockResolvedValueOnce({
        data: { id: "provider-2", user_id: "user-2", email: "owner2@example.com" },
        source: "tenant",
      })
      .mockResolvedValueOnce({
        data: {
          id: "plan-2",
          paystack_plan_code_monthly: "PLN_MONTHLY_ZA",
          paystack_plan_code_yearly: "PLN_YEARLY_ZA",
          subscription_plan_id: "subscription-plan-2",
        },
        source: "tenant",
      });

    const mockSupabaseAdmin = {
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { email: "owner2@example.com", full_name: "Owner 2" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "sub-free",
                      status: "active",
                      plan_id: "free-plan",
                      subscription_plans: { is_free: true },
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "tenants") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { default_currency: "ZAR" },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockCreateClient.mockReturnValue(mockSupabaseAdmin);
    mockInitializePaystackTransactionWithPlan.mockResolvedValue({
      data: {
        authorization_url: "https://paystack.test/auth-paid-upgrade",
        access_code: "acc_paid",
        reference: "ref_paid",
      },
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/subscriptions/create", {
      method: "POST",
      body: JSON.stringify({
        plan_id: "22222222-2222-4222-8222-222222222222",
        billing_period: "monthly",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body?.data?.authorization_url).toBe("https://paystack.test/auth-paid-upgrade");
  });
});

