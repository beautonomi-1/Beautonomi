import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const PROVIDER_ID = "44444444-4444-4444-8444-444444444444";
const BASIC_PLAN_ID = "55555555-5555-4555-8555-555555555555";
const EXPIRES_AT = new Date(Date.now() + 10 * 86400000).toISOString();

const mockDisableSubscriptionByCode = vi.fn();
const mockCreateSubscription = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockCreateClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: vi.fn(async () => ({ user: { id: "user-1", email: "p@example.com" } })),
  getProviderIdForUser: vi.fn(async () => PROVIDER_ID),
  successResponse: (data: unknown) => Response.json({ data, error: null }, { status: 200 }),
  notFoundResponse: (msg: string) =>
    Response.json({ data: null, error: { message: msg, code: "NOT_FOUND" } }, { status: 404 }),
  errorResponse: (msg: string, code: string, status: number) =>
    Response.json({ data: null, error: { message: msg, code } }, { status }),
  handleApiError: (error: unknown, fallback: string) =>
    Response.json(
      { data: null, error: { message: error instanceof Error ? error.message : fallback } },
      { status: 500 },
    ),
}));

vi.mock("@/lib/payments/paystack-complete", () => ({
  createCustomer: vi.fn(),
  fetchCustomer: vi.fn(async () => ({ data: { customer_code: "CUS_1" } })),
  createSubscription: (...args: unknown[]) => mockCreateSubscription(...args),
  disableSubscriptionByCode: (...args: unknown[]) => mockDisableSubscriptionByCode(...args),
}));

vi.mock("@/lib/bookings/resolve-payment-tenant", () => ({
  resourceTenantMatchesHostTenant: () => true,
}));
vi.mock("@/lib/notifications/onesignal", () => ({ sendTemplateNotification: vi.fn() }));
vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));
vi.mock("@/lib/iap/apple/ios-eligibility", () => ({
  getAppleBillingPaystackBlock: vi.fn(async () => ({ blocked: false })),
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/tenant/market-availability", () => ({
  assertTransactionalMarketAllowedForTenantId: vi.fn(async () => null),
}));
vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/provider/enforce-staff-cap-after-downgrade", () => ({
  enforceStaffCapForProviderPlan: vi.fn(async () => undefined),
}));
vi.mock("@/lib/subscriptions/resolve-subscription-online-gateway", () => ({
  resolveSubscriptionOnlineGatewayId: vi.fn(async () => "paystack"),
  subscriptionGatewayUsesPaystackCustomer: () => true,
}));

function setup(existing: { scheduled_plan_id?: string | null; cancelled_at?: string | null } = {}) {
  const adminUpdates: Array<Record<string, unknown>> = [];
  mockCreateClient.mockReturnValue({
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          adminUpdates.push(patch);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  });
  mockGetSupabaseServer.mockResolvedValue({
    from: (table: string) => {
      if (table === "providers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { tenant_id: "tenant-1", timezone: null } }),
            }),
          }),
        };
      }
      if (table === "subscription_plans") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: BASIC_PLAN_ID,
                  name: "Basic",
                  currency: "ZAR",
                  price_monthly: 100,
                  price_yearly: 1000,
                  is_active: true,
                  is_free: false,
                  paystack_plan_code_monthly: "PLN_basic_m",
                  paystack_plan_code_yearly: "PLN_basic_y",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { email: "p@example.com" } }) }),
          }),
        };
      }
      if (table === "provider_subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    paystack_authorization_code: "AUTH_1",
                    paystack_customer_code: "CUS_1",
                    paystack_subscription_code: "SUB_old",
                    plan_id: "pro",
                    expires_at: EXPIRES_AT,
                    next_payment_date: EXPIRES_AT,
                    scheduled_plan_id: existing.scheduled_plan_id ?? null,
                    cancelled_at: existing.cancelled_at ?? null,
                    subscription_plans: { name: "Pro", price_monthly: 300, price_yearly: 3000 },
                  },
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  });
  return { adminUpdates };
}

async function postDowngrade() {
  const { POST } = await import("../route");
  return POST(
    new NextRequest("http://localhost/api/provider/subscription/upgrade", {
      method: "POST",
      body: JSON.stringify({ plan_id: BASIC_PLAN_ID, billing_period: "monthly" }),
    }),
  );
}

describe("POST /api/provider/subscription/upgrade — paid-to-paid downgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDisableSubscriptionByCode.mockResolvedValue({ status: true });
  });

  it("disables the old Paystack sub and writes scheduled fields without cancelling", async () => {
    const { adminUpdates } = setup();
    const res = await postDowngrade();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.scheduled).toBe(true);
    expect(json.data.changes_on).toBe(EXPIRES_AT);
    expect(mockDisableSubscriptionByCode).toHaveBeenCalledWith("SUB_old", { tenantId: "tenant-1" });
    expect(mockCreateSubscription).not.toHaveBeenCalled();
    expect(adminUpdates).toHaveLength(1);
    expect(adminUpdates[0]).toMatchObject({
      scheduled_plan_id: BASIC_PLAN_ID,
      scheduled_change_at: EXPIRES_AT,
      scheduled_billing_period: "monthly",
    });
    expect(adminUpdates[0]).not.toHaveProperty("cancelled_at");
    expect(adminUpdates[0]).toMatchObject({ auto_renew: true });
  });

  it("leaves auto_renew alone on a row already cancelled at period end", async () => {
    const { adminUpdates } = setup({ cancelled_at: new Date().toISOString() });
    const res = await postDowngrade();

    expect(res.status).toBe(200);
    expect(adminUpdates[0]).not.toHaveProperty("auto_renew");
    expect(adminUpdates[0]).not.toHaveProperty("cancelled_at");
  });

  it("returns 502 and does not schedule when the Paystack disable fails", async () => {
    const { adminUpdates } = setup();
    mockDisableSubscriptionByCode.mockRejectedValue(new Error("paystack down"));
    const res = await postDowngrade();
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("PAYSTACK_DISABLE_FAILED");
    expect(adminUpdates).toHaveLength(0);
  });

  it("re-scheduling an already scheduled downgrade does not disable again", async () => {
    const { adminUpdates } = setup({ scheduled_plan_id: "66666666-6666-4666-8666-666666666666" });
    const res = await postDowngrade();

    expect(res.status).toBe(200);
    expect(mockDisableSubscriptionByCode).not.toHaveBeenCalled();
    expect(adminUpdates[0]).toMatchObject({ scheduled_plan_id: BASIC_PLAN_ID });
  });
});
