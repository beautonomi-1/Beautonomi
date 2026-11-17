/**
 * POST /api/admin/provider-subscriptions/[id]/activate
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";
import { computePaidPeriodExpiresAt } from "@/lib/subscriptions/provider-billing-merchant";

const mockRequireAdminSection = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: (...args: unknown[]) => mockRequireAdminSection(...args),
  };
});

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  extractRequestMeta: vi.fn().mockReturnValue({ ip_address: null, user_agent: null }),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn().mockResolvedValue("tenant-1"),
}));

const SUB_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d480";
const PROVIDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d481";
const FREE_PLAN = "f47ac10b-58cc-4372-a567-0e02b2c3d482";
const PAID_PLAN = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function buildSupabase(existing: Record<string, unknown>, options?: { hasPayment?: boolean }) {
  const updatePayload = vi.fn();
  const hasPayment = options?.hasPayment !== false;
  const from = vi.fn((table: string) => {
    if (table === "provider_subscriptions") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayload(payload);
          return {
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { ...existing, ...payload, id: SUB_ID },
              error: null,
            }),
          };
        }),
      };
    }
    if (table === "finance_transactions") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: hasPayment ? { id: "fin-1" } : null,
          error: null,
        }),
      };
    }
    if (table === "provider_subscription_orders") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }
    return {};
  });
  return { from, updatePayload };
}

describe("POST /api/admin/provider-subscriptions/[id]/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminSection.mockResolvedValue({ user: MOCK_USERS.superadmin });
  });

  it("keeps a later expires_at and does not rewrite started_at or the billing window", async () => {
    const laterEnd = new Date();
    laterEnd.setUTCFullYear(laterEnd.getUTCFullYear() + 1);
    const { from, updatePayload } = buildSupabase({
      id: SUB_ID,
      provider_id: PROVIDER_ID,
      plan_id: PAID_PLAN,
      status: "pending",
      expires_at: laterEnd.toISOString(),
      paystack_sync_pending: true,
      billing_period: "monthly",
      tenant_id: "tenant-1",
      subscription_plans: {
        is_free: false,
        price_monthly: 99,
        price_yearly: 999,
      },
    });
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { POST } = await import("../[id]/activate/route");
    const req = new NextRequest(
      `http://localhost/api/admin/provider-subscriptions/${SUB_ID}/activate`,
      { method: "POST", body: JSON.stringify({}) },
    );
    const res = await POST(req, { params: Promise.resolve({ id: SUB_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(updatePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        expires_at: laterEnd.toISOString(),
        paystack_sync_pending: false,
      }),
    );
    const payload = updatePayload.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.started_at).toBeUndefined();
    expect(payload.billing_period_start).toBeUndefined();
    expect(payload.billing_period_end).toBeUndefined();
  });

  it("opens one period from now when expires_at is missing", async () => {
    const before = Date.now();
    const { from, updatePayload } = buildSupabase({
      id: SUB_ID,
      provider_id: PROVIDER_ID,
      plan_id: PAID_PLAN,
      status: "pending",
      expires_at: null,
      paystack_sync_pending: true,
      billing_period: "monthly",
      tenant_id: "tenant-1",
      subscription_plans: {
        is_free: false,
        price_monthly: 99,
        price_yearly: 999,
      },
    });
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { POST } = await import("../[id]/activate/route");
    const req = new NextRequest(
      `http://localhost/api/admin/provider-subscriptions/${SUB_ID}/activate`,
      { method: "POST", body: JSON.stringify({}) },
    );
    const res = await POST(req, { params: Promise.resolve({ id: SUB_ID }) });

    expect(res.status).toBe(200);
    const payload = updatePayload.mock.calls[0][0] as {
      expires_at?: string;
      started_at?: string;
      billing_period_start?: string;
      billing_period_end?: string;
    };
    expect(payload.started_at).toBeTruthy();
    expect(payload.billing_period_start).toBeTruthy();
    expect(payload.billing_period_end).toBe(payload.expires_at);
    const startMs = Date.parse(String(payload.billing_period_start));
    expect(startMs).toBeGreaterThanOrEqual(before - 1000);
    expect(payload.expires_at).toBe(
      computePaidPeriodExpiresAt("monthly", new Date(startMs)),
    );
  });

  it("sets expires_at null for a free plan", async () => {
    const { from, updatePayload } = buildSupabase(
      {
        id: SUB_ID,
        provider_id: PROVIDER_ID,
        plan_id: FREE_PLAN,
        status: "pending",
        expires_at: null,
        paystack_sync_pending: false,
        billing_period: "monthly",
        tenant_id: "tenant-1",
        subscription_plans: {
          is_free: true,
          price_monthly: 0,
          price_yearly: 0,
        },
      },
      { hasPayment: false },
    );
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { POST } = await import("../[id]/activate/route");
    const req = new NextRequest(
      `http://localhost/api/admin/provider-subscriptions/${SUB_ID}/activate`,
      { method: "POST", body: JSON.stringify({ comped: true }) },
    );
    const res = await POST(req, { params: Promise.resolve({ id: SUB_ID }) });

    expect(res.status).toBe(200);
    const payload = updatePayload.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.expires_at).toBeNull();
    expect(payload.billing_period_start).toBeUndefined();
    expect(payload.billing_period_end).toBeUndefined();
  });
});
