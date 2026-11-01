import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockUserHasProviderAccessAdmin = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    userHasProviderAccessAdmin: (...args: unknown[]) => mockUserHasProviderAccessAdmin(...args),
    getProviderIdForUser: vi.fn(async () => "p1"),
  };
});

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { email: "a@b.com" }, error: null }),
    })),
  })),
}));

describe("POST initialize-payment guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "u1" },
    });
    mockUserHasProviderAccessAdmin.mockResolvedValue(true);
  });

  it("returns 409 for platform_fee invoice", async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "provider_invoices") {
          const c: Record<string, unknown> = {};
          c.select = vi.fn(() => c);
          c.eq = vi.fn(() => c);
          c.maybeSingle = vi.fn(() =>
            Promise.resolve({
              data: {
                id: "inv-1",
                provider_id: "p1",
                invoice_type: "platform_fee",
                status: "sent",
                total_amount: 100,
                amount_paid: 0,
                currency: "ZAR",
              },
              error: null,
            }),
          );
          return c;
        }
        throw new Error(table);
      }),
    });

    const { POST } = await import("../[id]/initialize-payment/route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/invoices/inv-1/initialize-payment", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "inv-1" }) },
    );
    expect(res.status).toBe(409);
  });
});
