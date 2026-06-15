import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn().mockResolvedValue({ defaultCurrency: "ZAR" }),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn().mockResolvedValue("tenant-1"),
}));

describe("GET /api/provider/billing-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
  });

  it("surfaces DB errors instead of returning an empty list", async () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: "db down" }, count: null }),
    );
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "providers") {
          const p: Record<string, unknown> = {};
          p.select = vi.fn(() => p);
          p.eq = vi.fn(() => p);
          p.maybeSingle = vi.fn(() => Promise.resolve({ data: { tenant_id: "tenant-1" }, error: null }));
          return p;
        }
        if (table === "finance_transactions") return chain;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const { GET } = await import("../billing-history/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/billing-history"));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("returns items with pagination metadata", async () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() =>
      Promise.resolve({
        data: [
          {
            id: "tx-1",
            amount: 99,
            currency: "ZAR",
            created_at: "2026-01-01T00:00:00Z",
            description: "Subscription",
            transaction_type: "provider_subscription_payment",
            metadata: null,
          },
        ],
        error: null,
        count: 1,
      }),
    );
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "providers") {
          const p: Record<string, unknown> = {};
          p.select = vi.fn(() => p);
          p.eq = vi.fn(() => p);
          p.maybeSingle = vi.fn(() => Promise.resolve({ data: { tenant_id: "tenant-1" }, error: null }));
          return p;
        }
        if (table === "finance_transactions") return chain;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const { GET } = await import("../billing-history/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/billing-history"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(body.data.has_more).toBe(false);
  });
});

describe("PATCH /api/provider/finance/vat-reports/[id]/mark-remitted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
  });

  it("updates existing reminder by reminder.id when URL id is new", async () => {
    const updateEq = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({
            data: { id: "rem-real", remitted_to_sars: true },
            error: null,
          }),
        ),
      })),
    }));
    const update = vi.fn(() => ({ eq: updateEq }));

    const reminderQuery: Record<string, unknown> = {};
    reminderQuery.select = vi.fn(() => reminderQuery);
    reminderQuery.eq = vi.fn(() => reminderQuery);
    reminderQuery.order = vi.fn(() => reminderQuery);
    reminderQuery.limit = vi.fn(() => reminderQuery);
    reminderQuery.maybeSingle = vi.fn(() =>
      Promise.resolve({
        data: { id: "rem-real", provider_id: "provider-1", remitted_to_sars: false },
        error: null,
      }),
    );

    mockGetSupabaseAdmin.mockReturnValue(undefined);
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table !== "vat_remittance_reminders") throw new Error(`Unexpected table ${table}`);
        return {
          select: vi.fn(() => reminderQuery),
          update,
        };
      }),
    };

    vi.doMock("@/lib/supabase/server", () => ({
      getSupabaseServer: vi.fn().mockResolvedValue(mockSupabase),
    }));

    const { PATCH } = await import("../finance/vat-reports/[id]/mark-remitted/route");
    const req = new NextRequest("http://localhost/api/provider/finance/vat-reports/new/mark-remitted", {
      method: "PATCH",
      body: JSON.stringify({ period_start: "2026-01-01", period_end: "2026-02-28" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "new" }) });
    expect(res.status).toBe(200);
    expect(updateEq).toHaveBeenCalledWith("id", "rem-real");
  });
});
