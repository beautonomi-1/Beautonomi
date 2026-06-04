/**
 * PATCH /api/admin/provider-subscriptions/[id] — assign, reactivate, cancel rules.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

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

vi.mock("@/lib/payments/paystack-complete", () => ({
  disableSubscriptionByCode: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn().mockResolvedValue("tenant-1"),
}));

vi.mock("@/lib/subscription/admin-merged-plan-ids", () => ({
  getMergedSubscriptionPlanIdsForTenant: vi.fn().mockResolvedValue(
    new Set([
      "f47ac10b-58cc-4372-a567-0e02b2c3d482",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    ]),
  ),
}));

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn().mockResolvedValue("tenant-1"),
}));

const SUB_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d480";
const PROVIDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d481";
const FREE_PLAN = "f47ac10b-58cc-4372-a567-0e02b2c3d482";
const PAID_PLAN = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function buildSupabase(existing: Record<string, unknown>, planRows: Record<string, unknown>) {
  const updatePayload = vi.fn();
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
    if (table === "providers") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: PROVIDER_ID, tenant_id: "tenant-1" },
          error: null,
        }),
      };
    }
    if (table === "subscription_plans") {
      let queriedId = planRows.id as string;
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((_col: string, val: string) => {
          queriedId = val;
          return chain;
        }),
        maybeSingle: vi.fn().mockImplementation(async () => {
          if (queriedId === FREE_PLAN) {
            return {
              data: { id: FREE_PLAN, is_free: true, price_monthly: 0, price_yearly: 0 },
              error: null,
            };
          }
          return {
            data: { id: PAID_PLAN, is_free: false, price_monthly: 99, price_yearly: 999 },
            error: null,
          };
        }),
      };
      return chain;
    }
    return {};
  });
  return { from, updatePayload };
}

describe("PATCH /api/admin/provider-subscriptions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminSection.mockResolvedValue({ user: MOCK_USERS.superadmin });
  });

  it(
    "rejects cancelling a free subscription",
    async () => {
    const { from } = buildSupabase(
      {
        id: SUB_ID,
        provider_id: PROVIDER_ID,
        plan_id: FREE_PLAN,
        status: "active",
        paystack_subscription_code: null,
        tenant_id: "tenant-1",
      },
      { id: FREE_PLAN },
    );
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { PATCH } = await import("../[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/provider-subscriptions/${SUB_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: SUB_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(String(body.error?.message ?? body.error)).toMatch(/free/i);
    },
    15_000,
  );

  it("assigning a free plan reactivates a cancelled paid row", async () => {
    const { from, updatePayload } = buildSupabase(
      {
        id: SUB_ID,
        provider_id: PROVIDER_ID,
        plan_id: PAID_PLAN,
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        paystack_subscription_code: null,
        tenant_id: "tenant-1",
      },
      { id: PAID_PLAN },
    );
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { PATCH } = await import("../[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/provider-subscriptions/${SUB_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ plan_id: FREE_PLAN }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: SUB_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(updatePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        cancelled_at: null,
        plan_id: FREE_PLAN,
        expires_at: null,
      }),
    );
  });

  it("reactivate sets status active and clears cancelled_at", async () => {
    const { from, updatePayload } = buildSupabase(
      {
        id: SUB_ID,
        provider_id: PROVIDER_ID,
        plan_id: PAID_PLAN,
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        paystack_subscription_code: null,
        tenant_id: "tenant-1",
      },
      { id: PAID_PLAN },
    );
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { PATCH } = await import("../[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/provider-subscriptions/${SUB_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: SUB_ID }) });
    expect(res.status).toBe(200);
    expect(updatePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        cancelled_at: null,
      }),
    );
  });

  it("reactivate on cancelled free clears cancelled_at and free-tier Paystack fields", async () => {
    const { from, updatePayload } = buildSupabase(
      {
        id: SUB_ID,
        provider_id: PROVIDER_ID,
        plan_id: FREE_PLAN,
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        paystack_subscription_code: null,
        tenant_id: "tenant-1",
      },
      { id: FREE_PLAN },
    );
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { PATCH } = await import("../[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/provider-subscriptions/${SUB_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: SUB_ID }) });
    expect(res.status).toBe(200);
    expect(updatePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        cancelled_at: null,
        expires_at: null,
        auto_renew: false,
        paystack_subscription_code: null,
      }),
    );
  });

  it("paid cancel before period end keeps status active with cancelled_at set", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { from, updatePayload } = buildSupabase(
      {
        id: SUB_ID,
        provider_id: PROVIDER_ID,
        plan_id: PAID_PLAN,
        status: "active",
        expires_at: future,
        cancelled_at: null,
        paystack_subscription_code: "SUB_abc",
        tenant_id: "tenant-1",
      },
      { id: PAID_PLAN },
    );
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { PATCH } = await import("../[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/provider-subscriptions/${SUB_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: SUB_ID }) });
    expect(res.status).toBe(200);
    expect(updatePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        auto_renew: false,
        cancelled_at: expect.any(String),
      }),
    );
  });
});
