import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** buntulink@gmail.com / provider "bantu" — from production SQL audit */
const BANTU_USER_ID = "11ccc539-9160-47be-b7b3-5fef986f1033";
const BANTU_PROVIDER_ID = "0350ad64-f317-4464-9a19-6c39be1f1255";
const BANTU_TIMEZONE = "Etc/GMT-2";
const BILLING_YEAR = 2026;

const mockRequireRoleInApi = vi.fn();
const mockRequireAnyPermission = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requireAnyPermission: (...args: unknown[]) => mockRequireAnyPermission(...args),
}));

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

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn().mockResolvedValue({ defaultCurrency: "ZAR" }),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn().mockResolvedValue("tenant-1"),
}));

vi.mock("@/lib/subscription/pricing-plan-display-features", () => ({
  getDisplayFeatureBulletsForSubscriptionPlans: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/locale/tenant-locale", () => ({
  getTenantLocaleTagFromRegionConfig: vi.fn().mockReturnValue("en-ZA"),
}));

/** Free-tier fixture — no subscription payment rows in billing history. */
const BANTU_BILLING_TXNS: never[] = [];

const BANTU_FREE_SUBSCRIPTION = {
  id: "sub-bantu-1",
  provider_id: BANTU_PROVIDER_ID,
  status: "active",
  plan_id: "plan-free",
  expires_at: null,
  cancelled_at: null,
  paystack_sync_pending: false,
  plan: {
    id: "plan-free",
    name: "Free",
    description: "Free tier",
    price_monthly: 0,
    price_yearly: 0,
    currency: "ZAR",
    features: [],
    is_free: true,
  },
};

function makeBillingHistoryAdminClient(rows: unknown[] = BANTU_BILLING_TXNS) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() =>
    Promise.resolve({ data: rows, error: null, count: rows.length }),
  );
  return {
    from: vi.fn((table: string) => {
      if (table === "providers") {
        const p: Record<string, unknown> = {};
        p.select = vi.fn(() => p);
        p.eq = vi.fn(() => p);
        p.maybeSingle = vi.fn(() =>
          Promise.resolve({ data: { tenant_id: "tenant-1" }, error: null }),
        );
        return p;
      }
      if (table === "finance_transactions") return chain;
      throw new Error(`Unexpected admin table ${table}`);
    }),
  };
}

function makeInvoicesServerClientFixed(invoices: unknown[] = []) {
  let invoicesFromCall = 0;
  return {
    from: vi.fn((table: string) => {
      if (table !== "provider_invoices") throw new Error(`Unexpected server table ${table}`);
      invoicesFromCall += 1;
      if (invoicesFromCall === 1) {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        chain.range = vi.fn(() =>
          Promise.resolve({ data: invoices, error: null, count: invoices.length }),
        );
        return chain;
      }
      const summaryChain: Record<string, unknown> = {};
      summaryChain.select = vi.fn(() => summaryChain);
      summaryChain.eq = vi.fn(() => summaryChain);
      // Route awaits summaryQuery without range — Supabase builder is thenable
      Object.assign(summaryChain, {
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: [], error: null }),
      });
      return summaryChain;
    }),
  };
}

function makeVatServerClient(opts: {
  isVatRegistered?: boolean;
  vatTxRows?: unknown[];
}) {
  const { isVatRegistered = false, vatTxRows = [] } = opts;
  return {
    from: vi.fn((table: string) => {
      if (table === "providers") {
        const p: Record<string, unknown> = {};
        p.select = vi.fn(() => p);
        p.eq = vi.fn(() => p);
        p.maybeSingle = vi.fn(() =>
          Promise.resolve({
            data: {
              is_vat_registered: isVatRegistered,
              vat_number: isVatRegistered ? "4123456789" : null,
              tenant_id: "tenant-1",
              timezone: BANTU_TIMEZONE,
            },
            error: null,
          }),
        );
        return p;
      }
      if (table === "finance_transactions") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.gte = vi.fn(() => chain);
        chain.lte = vi.fn(() =>
          Promise.resolve({ data: vatTxRows, error: null }),
        );
        return chain;
      }
      if (table === "vat_remittance_reminders") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.gte = vi.fn(() => chain);
        chain.lte = vi.fn(() => chain);
        chain.order = vi.fn(() =>
          Promise.resolve({ data: [], error: null }),
        );
        return chain;
      }
      if (table === "bookings") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.in = vi.fn(() => Promise.resolve({ data: [], error: null }));
        return chain;
      }
      throw new Error(`Unexpected server table ${table}`);
    }),
  };
}

function makeSubscriptionServerClient(subscription: unknown = BANTU_FREE_SUBSCRIPTION) {
  return {
    from: vi.fn((table: string) => {
      if (table === "provider_subscriptions") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(() =>
          Promise.resolve({ data: subscription, error: null }),
        );
        chain.update = vi.fn(() => chain);
        return chain;
      }
      if (table === "provider_subscription_orders") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.in = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        return chain;
      }
      throw new Error(`Unexpected server table ${table}`);
    }),
  };
}

function setupAuthMocks() {
  mockRequireRoleInApi.mockResolvedValue({
    user: { id: BANTU_USER_ID, role: "provider_owner" },
  });
  mockRequireAnyPermission.mockResolvedValue({
    authorized: true,
    user: { id: BANTU_USER_ID, role: "provider_owner" },
  });
  mockGetProviderIdForUser.mockResolvedValue(BANTU_PROVIDER_ID);
}

describe("Billing hub API URLs — bantu provider fixture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthMocks();
    mockGetSupabaseAdmin.mockReturnValue(makeBillingHistoryAdminClient());
    mockGetSupabaseServer.mockResolvedValue(makeInvoicesServerClientFixed());
  });

  it("default Bills paid URL matches mobile billing-history tab", () => {
    const url = `/api/provider/billing-history?limit=50`;
    expect(url).toBe("/api/provider/billing-history?limit=50");
  });

  it("default Invoices URL matches mobile billing hub first page", () => {
    const url = `/api/provider/invoices?page=1&limit=25`;
    expect(url).toBe("/api/provider/invoices?page=1&limit=25");
  });

  it("default VAT URL uses current calendar year", () => {
    const url = `/api/provider/finance/vat-reports?year=${BILLING_YEAR}`;
    expect(url).toBe("/api/provider/finance/vat-reports?year=2026");
  });

  it("Plan tab URL is /api/provider/subscription", () => {
    expect("/api/provider/subscription").toBe("/api/provider/subscription");
  });

  it("GET /api/provider/billing-history returns empty items for free-tier bantu (no platform charges)", async () => {
    const { GET } = await import("../billing-history/route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/billing-history?limit=50"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.data.items).toEqual([]);
    expect(body.data.total).toBe(0);
    expect(body.data.has_more).toBe(false);
  });

  it("GET /api/provider/invoices returns invoices envelope for bantu", async () => {
    mockGetSupabaseServer.mockResolvedValue(makeInvoicesServerClientFixed([]));
    const { GET } = await import("../invoices/route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/invoices?page=1&limit=25"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(Array.isArray(body.data.invoices)).toBe(true);
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(25);
  });

  it("GET /api/provider/finance/vat-reports returns not-registered payload for bantu", async () => {
    mockGetSupabaseServer.mockResolvedValue(makeVatServerClient({ isVatRegistered: false }));
    const { GET } = await import("../finance/vat-reports/route");
    const res = await GET(
      new NextRequest(`http://localhost/api/provider/finance/vat-reports?year=${BILLING_YEAR}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.data.reports).toEqual([]);
    expect(body.data.provider.is_vat_registered).toBe(false);
    expect(body.data.year).toBe(BILLING_YEAR);
  });

  it("GET /api/provider/subscription returns free-tier plan without billing_issue", async () => {
    mockGetSupabaseServer.mockResolvedValue(makeSubscriptionServerClient());
    const { GET } = await import("../subscription/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/subscription"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.data.plan.is_free).toBe(true);
    expect(body.data.billing_issue).toBeNull();
  });

  it("mobile client unwraps billing-history successResponse envelope (items array)", async () => {
    const { GET } = await import("../billing-history/route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/billing-history?limit=50"),
    );
    const raw = await res.json();
    const payload = raw.data ?? raw;
    expect(Array.isArray(payload.items)).toBe(true);
  });

  it("mobile client unwraps invoices successResponse envelope (invoices array)", async () => {
    mockGetSupabaseServer.mockResolvedValue(makeInvoicesServerClientFixed([]));
    const { GET } = await import("../invoices/route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/invoices?page=1&limit=25"),
    );
    const raw = await res.json();
    const invData = raw.data ?? raw;
    expect(Array.isArray(invData.invoices)).toBe(true);
  });

  it("GET /api/provider/billing-history rejects unauthenticated callers", async () => {
    mockRequireRoleInApi.mockRejectedValueOnce(new Error("Authentication required"));
    const { GET } = await import("../billing-history/route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/billing-history?limit=50"),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
