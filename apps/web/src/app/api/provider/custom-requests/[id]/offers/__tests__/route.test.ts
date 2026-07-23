import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockResolveTenant = vi.fn();
const mockGetTenantRegionConfig = vi.fn();
const mockIsFeatureEnabledServer = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  successResponse: (data: unknown, status = 200) =>
    Response.json({ data, error: null }, { status }),
  handleApiError: (error: unknown, fallback: string, status = 500) =>
    Response.json(
      { data: null, error: { message: error instanceof Error ? error.message : fallback } },
      { status },
    ),
  notFoundResponse: (msg: string) =>
    Response.json({ data: null, error: { message: msg, code: "NOT_FOUND" } }, { status: 404 }),
  errorResponse: (msg: string, code: string, status: number) =>
    Response.json({ data: null, error: { message: msg, code } }, { status }),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenant(...args),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: (...args: unknown[]) => mockGetTenantRegionConfig(...args),
}));

vi.mock("@/lib/server/feature-flags", () => ({
  isFeatureEnabledServer: (...args: unknown[]) => mockIsFeatureEnabledServer(...args),
}));

vi.mock("@/lib/subscriptions/feature-access", () => ({
  checkNewGateFeatureAccess: vi.fn().mockResolvedValue(true),
  SUBSCRIPTION_FEATURE_KEYS: { customRequests: "custom_requests" },
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: () => Promise.resolve({ error: null }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  }),
}));

vi.mock("@/lib/chat/resolve-conversation", () => ({
  resolveCustomerProviderConversation: vi.fn().mockResolvedValue({ id: "conv-1" }),
  updateConversationAfterMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotifications: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendTemplateNotification: vi.fn().mockResolvedValue(undefined),
}));

function makeSupabase(request: Record<string, unknown> | null) {
  return {
    from(table: string) {
      if (table === "providers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: "tenant-1" }, error: null }),
            }),
          }),
        };
      }
      if (table === "custom_requests") {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          update: () => ({ eq: () => ({ in: () => Promise.resolve({ data: null, error: null }) }) }),
          single: vi.fn().mockResolvedValue({ data: request, error: null }),
        };
        return builder;
      }
      if (table === "custom_offers") {
        return {
          insert: () => ({
            select: () => ({
              single: vi.fn().mockResolvedValue({ data: { id: "offer-1" }, error: null }),
            }),
          }),
        };
      }
      if (table === "messages" || table === "conversations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "conv-1" }, error: null }) }),
          }),
        };
      }
      if (table === "provider_staff" || table === "provider_locations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data:
                    table === "provider_locations"
                      ? { id: "11111111-1111-4111-8111-111111111111" }
                      : { id: "22222222-2222-4222-8222-222222222222" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

async function callRoute(reqRow: Record<string, unknown> | null, body: Record<string, unknown>) {
  mockRequirePermission.mockResolvedValue({
    authorized: true,
    user: { id: "user-1", role: "provider_owner" },
  });
  mockGetProviderIdForUser.mockResolvedValue("provider-1");
  mockResolveTenant.mockResolvedValue("tenant-1");
  mockGetTenantRegionConfig.mockResolvedValue({ defaultCurrency: "ZAR" });
  mockIsFeatureEnabledServer.mockResolvedValue(true);
  mockGetSupabaseServer.mockResolvedValue(makeSupabase(reqRow));

  const { POST } = await import("../route");
  const req = new NextRequest("https://app.example.com/api/provider/custom-requests/req-1/offers", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id: "req-1" }) });
}

const FUTURE_EXPIRATION = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const FUTURE_REQUEST_EXPIRY = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST_EXPIRATION = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe("POST /api/provider/custom-requests/[id]/offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("rejects when the parent request is cancelled", async () => {
    const res = await callRoute(
      {
        id: "req-1",
        customer_id: "customer-1",
        status: "cancelled",
        expires_at: FUTURE_REQUEST_EXPIRY,
        providers: { business_name: "Salon" },
      },
      {
        price: 100,
        duration_minutes: 60,
        expiration_at: FUTURE_EXPIRATION,
      },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("REQUEST_CLOSED");
  });

  it("rejects when the parent request expired", async () => {
    const res = await callRoute(
      {
        id: "req-1",
        customer_id: "customer-1",
        status: "pending",
        expires_at: PAST_EXPIRATION,
        providers: { business_name: "Salon" },
      },
      {
        price: 100,
        duration_minutes: 60,
        expiration_at: FUTURE_EXPIRATION,
      },
    );
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe("REQUEST_EXPIRED");
  });

  it("rejects when the offer expiration is in the past", async () => {
    const res = await callRoute(
      {
        id: "req-1",
        customer_id: "customer-1",
        status: "pending",
        expires_at: FUTURE_REQUEST_EXPIRY,
        location_type: "at_salon",
        providers: { business_name: "Salon" },
      },
      {
        price: 100,
        duration_minutes: 60,
        expiration_at: PAST_EXPIRATION,
        location_id: "11111111-1111-4111-8111-111111111111",
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_EXPIRATION");
  });

  it("rejects at-salon offers without a location", async () => {
    const res = await callRoute(
      {
        id: "req-1",
        customer_id: "customer-1",
        status: "pending",
        expires_at: FUTURE_REQUEST_EXPIRY,
        location_type: "at_salon",
        providers: { business_name: "Salon" },
      },
      {
        price: 100,
        duration_minutes: 60,
        expiration_at: FUTURE_EXPIRATION,
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts a valid offer on an open request", async () => {
    const res = await callRoute(
      {
        id: "req-1",
        customer_id: "customer-1",
        status: "pending",
        expires_at: FUTURE_REQUEST_EXPIRY,
        location_type: "at_salon",
        providers: { business_name: "Salon" },
      },
      {
        price: 100,
        duration_minutes: 60,
        expiration_at: FUTURE_EXPIRATION,
        location_id: "11111111-1111-4111-8111-111111111111",
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("offer-1");
  });
});
