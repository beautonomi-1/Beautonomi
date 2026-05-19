import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: vi.fn(),
}));

function thenable<T>(value: T) {
  return {
    then: (resolve: (v: T) => unknown) => Promise.resolve(value).then(resolve),
  };
}

interface BuildOpts {
  billingRow?: Record<string, unknown> | null;
  paymentMethodRows?: Record<string, unknown>[];
  invoiceRows?: Record<string, unknown>[];
}

function buildSupabaseFrom(opts: BuildOpts) {
  return vi.fn((table: string) => {
    if (table === "providers") {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: opts.billingRow ?? null, error: null }),
      );
      return chain;
    }
    if (table === "provider_payment_methods") {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.order = vi.fn(() => thenable({ data: opts.paymentMethodRows ?? [], error: null }));
      return chain;
    }
    if (table === "provider_invoices") {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.limit = vi.fn(() => thenable({ data: opts.invoiceRows ?? [], error: null }));
      return chain;
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("GET /api/provider/settings/billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T09:00:00.000Z"));
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
  });

  it("exposes formatted expiry and expired flag on payment methods", async () => {
    const fromMock = buildSupabaseFrom({
      billingRow: { billing_address: null, billing_email: null, billing_phone: null },
      paymentMethodRows: [
        {
          id: "ppm-1",
          name: "Business Visa",
          type: "card",
          last4: "1234",
          expiry_month: 11,
          expiry_year: 2028,
          is_default: true,
          is_active: true,
        },
        {
          id: "ppm-2",
          name: "Old Mastercard",
          type: "card",
          last4: "9876",
          expiry_month: 3,
          expiry_year: 2026,
          is_default: false,
          is_active: true,
        },
      ],
    });
    mockGetSupabaseServer.mockResolvedValue({ from: fromMock });

    const { GET } = await import("../route");
    const request = new NextRequest("http://localhost/api/provider/settings/billing");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.paymentMethods).toHaveLength(2);

    const active = body.data.paymentMethods.find((m: { id: string }) => m.id === "ppm-1");
    expect(active.expiry_label).toBe("11/28");
    expect(active.is_expired).toBe(false);

    const expired = body.data.paymentMethods.find((m: { id: string }) => m.id === "ppm-2");
    expect(expired.expiry_label).toBe("03/26");
    expect(expired.is_expired).toBe(true);
  });
});
